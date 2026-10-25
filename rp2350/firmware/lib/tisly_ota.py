"""
TiSLY 全現場 RP2350 標準 OTA エンジン

PoE LAN 経由で VPS から MicroPython を取得し、
A/B バックアップ後に差し替えて自己再起動する。
config.py は物件固有のため上書きしない。
"""

import json

try:
    import machine
except ImportError:
    machine = None

try:
    import os
except ImportError:
    os = None

OTA_STATE_FILE = "ota_state.json"
OTA_PENDING_FILE = "ota_pending.txt"
OTA_BOOT_STARTED = "ota_boot_started"
OTA_OK_FILE = "ota_ok.txt"
DEFAULT_FILES = (
    "main.py",
    "toyoshima_security.py",
    "security_light.py",
    "boot.py",
    "lib/tisly_ota.py",
    "lib/tisly_rgb.py",
    "tisly_self_test.py",
)
SKIP_FILES = ("config.py",)


def log(msg):
    try:
        print("[TiSLY OTA]", msg)
    except Exception:
        print("[TiSLY OTA]", str(msg).encode("ascii", "replace"))


def log_error(msg):
    try:
        print("[TiSLY OTA] error:", msg)
    except Exception:
        print("[TiSLY OTA] error")


def _kick(kick_wdt):
    if not kick_wdt:
        return
    try:
        kick_wdt()
    except Exception:
        pass


def _exists(path):
    try:
        os.stat(path)
        return True
    except Exception:
        return False


def _read_text(path):
    try:
        with open(path, "r") as f:
            return f.read()
    except Exception:
        return ""


def _write_text(path, text):
    parent = path.rfind("/")
    if parent > 0:
        folder = path[:parent]
        try:
            os.mkdir(folder)
        except Exception:
            pass
    with open(path, "w") as f:
        f.write(text)


def _copy_file(src, dst):
    with open(src, "rb") as f:
        data = f.read()
    parent = dst.rfind("/")
    if parent > 0:
        folder = dst[:parent]
        try:
            os.mkdir(folder)
        except Exception:
            pass
    with open(dst, "wb") as f:
        f.write(data)


def _remove(path):
    try:
        os.remove(path)
    except Exception:
        pass


def _reset():
    if machine is None:
        log("machine.reset skipped (host test)")
        return
    machine.reset()


def load_ota_state():
    """状態ファイルが無い場合は空で返す。
    版を埋めると USB 書き込み直後に
    1.0.0 と誤申告して不要な OTA を招く。
    """
    raw = _read_text(OTA_STATE_FILE)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {}


def save_ota_state(state):
    _write_text(OTA_STATE_FILE, json.dumps(state))


def _running_logic_version(config=None):
    """動いているスクリプトの版。状態ファイルよりこちらを優先する。"""
    slug = ""
    try:
        slug = site_slug(config)
    except Exception:
        slug = ""
    if slug == "itabashi":
        names = ("security_light",)
    elif slug == "ryugasaki":
        names = ("ryugasaki_security",)
    else:
        names = ("toyoshima_security",)
    for mod_name in names:
        try:
            mod = __import__(mod_name)
        except Exception:
            continue
        ver = str(getattr(mod, "FIRMWARE_LOGIC_VERSION", "") or "").strip()
        if ver and ver != "safe-mode":
            return ver
    return ""


def local_version(config=None):
    running = _running_logic_version(config)
    if running:
        return running
    state = load_ota_state()
    saved = str(state.get("version") or "").strip()
    if saved:
        return saved
    embedded = ""
    if config is not None:
        embedded = str(getattr(config, "OTA_VERSION", "") or "").strip()
        if not embedded:
            embedded = str(getattr(config, "FIRMWARE_VERSION", "") or "").strip()
    if embedded and embedded != "safe-mode":
        return embedded
    return "1.0.0"


def site_slug(config=None):
    if config is None:
        return "toyoshima"
    raw = str(getattr(config, "OTA_SITE", "") or "").strip()
    if raw:
        return raw
    site = str(getattr(config, "SITE_ID", "") or "").upper()
    if "RYUGASAKI" in site or "WASHMATE" in site:
        return "ryugasaki"
    if "ITABASHI" in site:
        return "itabashi"
    return "toyoshima"


def ota_channel(config=None):
    raw = str(getattr(config, "OTA_CHANNEL", "production") or "")
    raw = raw.strip().lower()
    if raw == "staging":
        return "staging"
    return "production"


def has_ota_update_from_body(body):
    if not body:
        return False
    try:
        data = json.loads(body)
    except Exception:
        return False
    if not isinstance(data, dict):
        return False
    if data.get("has_ota_update") or data.get("update_required"):
        return True
    ota = data.get("ota")
    if isinstance(ota, dict) and (
        ota.get("has_ota_update") or ota.get("update_required")
    ):
        return True
    return False


def _syntax_ok(name, text, kick_wdt=None):
    _kick(kick_wdt)
    if name.endswith(".py") is False:
        return True
    try:
        compile(text, name, "exec")
        return True
    except Exception as exc:
        log_error("syntax {}: {}".format(name, exc))
        return False


def _checksum_ok(text, expected):
    if not expected:
        return True
    try:
        import hashlib

        got = hashlib.sha256(text.encode("utf-8")).hexdigest()
        return got == expected
    except Exception:
        return True


def recover_if_needed():
    """
    起動直後の文鎮化防止。
    前回 OTA 後に main が落ちていれば
    main_backup.py から復元して再起動する。
    """
    pending = _exists(OTA_PENDING_FILE)
    if not pending:
        _remove(OTA_BOOT_STARTED)
        return False
    crashed = _exists(OTA_BOOT_STARTED)
    if not crashed:
        _write_text(OTA_BOOT_STARTED, "1")
        return False
    log("OTA fail detected - restore backup")
    restored = False
    if _exists("main_backup.py"):
        try:
            _copy_file("main_backup.py", "main.py")
            restored = True
        except Exception as exc:
            log_error("restore main: {}".format(exc))
    for name in (
        "toyoshima_security.py",
        "security_light.py",
        "boot.py",
        "tisly_self_test.py",
        "lib/tisly_ota.py",
        "lib/tisly_rgb.py",
    ):
        bak = name.replace(".py", "_backup.py")
        if _exists(bak):
            try:
                _copy_file(bak, name)
            except Exception:
                pass
    state = load_ota_state()
    state["version"] = ""
    state["ok"] = False
    try:
        save_ota_state(state)
    except Exception as exc:
        log_error("clear state: {}".format(exc))
    _remove(OTA_PENDING_FILE)
    _remove(OTA_BOOT_STARTED)
    if restored:
        _reset()
    return restored


def mark_boot_ok(config=None):
    """最初の正常 HB 後に pending を解除する。"""
    state = load_ota_state()
    state["ok"] = True
    running = _running_logic_version(config)
    if running:
        state["version"] = running
    save_ota_state(state)
    _remove(OTA_PENDING_FILE)
    _remove(OTA_BOOT_STARTED)
    _write_text(OTA_OK_FILE, state.get("version") or "ok")


def _apply_file(name, text, kick_wdt=None):
    _kick(kick_wdt)
    tmp = name
    if name.endswith(".py"):
        tmp = name[:-3] + "_new.py"
    else:
        tmp = name + ".new"
    _write_text(tmp, text)
    if name.endswith(".py"):
        bak = name[:-3] + "_backup.py"
    else:
        bak = name + ".bak"
    if _exists(name):
        try:
            _copy_file(name, bak)
        except Exception as exc:
            log_error("backup {}: {}".format(name, exc))
            return False
    _copy_file(tmp, name)
    _remove(tmp)
    return True


def _tmp_path(name):
    if str(name).endswith(".py"):
        return name[:-3] + "_new.py"
    return name + ".new"


def _new_sha256():
    try:
        import hashlib

        return hashlib.sha256()
    except Exception:
        pass
    try:
        import uhashlib

        return uhashlib.sha256()
    except Exception:
        return None


def _api_parts(config):
    raw = "https://tisly.jp"
    if config is not None:
        raw = str(getattr(config, "API_BASE", "") or raw).strip() or raw
    use_ssl = raw.startswith("https://")
    rest = raw.split("://", 1)[-1]
    hostport = rest.split("/", 1)[0]
    host = hostport
    port = 443 if use_ssl else 80
    if hostport.count(":") == 1:
        host, port_s = hostport.rsplit(":", 1)
        try:
            port = int(port_s)
        except Exception:
            port = 443 if use_ssl else 80
    return host, port, use_ssl


def _mkdirs_for(path):
    parent = str(path).rfind("/")
    if parent > 0:
        try:
            os.mkdir(path[:parent])
        except Exception:
            pass


def _cleanup_temps(temps):
    for _name, tmp in temps:
        _remove(tmp)


def _stream_download(path, dest, expected, config, kick_wdt):
    """受信しながらフラッシュへ書く。待ちの途中で WDT を蹴る。"""
    import socket

    host, port, use_ssl = _api_parts(config)
    token = ""
    if config is not None:
        token = str(getattr(config, "REMOTE_TEST_TOKEN", "") or "")
    sock = None
    try:
        try:
            import gc

            gc.collect()
        except Exception:
            pass
        _kick(kick_wdt)
        infos = socket.getaddrinfo(host, port, 0, socket.SOCK_STREAM)
        addr = infos[0][-1]
        sock = socket.socket()
        sock.settimeout(4)
        _kick(kick_wdt)
        sock.connect(addr)
        _kick(kick_wdt)
        if use_ssl:
            import ssl

            try:
                sock = ssl.wrap_socket(sock, server_hostname=host)
            except TypeError:
                sock = ssl.wrap_socket(sock)
            _kick(kick_wdt)
        try:
            sock.settimeout(4)
        except Exception:
            pass
        req = (
            "GET {} HTTP/1.0\r\n"
            "Host: {}\r\n"
            "Accept-Encoding: identity\r\n"
            "Connection: close\r\n"
            "X-Remote-Test-Token: {}\r\n"
            "\r\n"
        ).format(path, host, token)
        sock.send(req.encode("ascii", "ignore"))
        header = b""
        while header.find(b"\r\n\r\n") < 0:
            _kick(kick_wdt)
            piece = sock.recv(256)
            if not piece:
                break
            header += piece
            if len(header) > 8192:
                break
        sep = header.find(b"\r\n\r\n")
        if sep < 0:
            log_error("headers {}".format(path))
            return False
        head = header[:sep].decode("latin-1")
        pre = header[sep + 4 :]
        lines = head.split("\r\n")
        status = 0
        parts = lines[0].split()
        if len(parts) >= 2:
            try:
                status = int(parts[1])
            except Exception:
                status = 0
        if status != 200:
            log_error("download fail {} HTTP {}".format(path, status))
            return False
        headers = {}
        idx = 1
        while idx < len(lines):
            line = lines[idx]
            idx += 1
            if ":" not in line:
                continue
            key, val = line.split(":", 1)
            headers[key.strip().lower()] = val.strip()
        encoding = str(headers.get("content-encoding") or "").lower()
        if encoding.find("gzip") >= 0:
            log_error("gzip body {}".format(path))
            return False
        total = -1
        if headers.get("content-length"):
            try:
                total = int(headers.get("content-length"))
            except Exception:
                total = -1
        hasher = _new_sha256()
        _mkdirs_for(dest)
        got = 0
        with open(dest, "wb") as out:
            if pre:
                out.write(pre)
                if hasher:
                    hasher.update(pre)
                got += len(pre)
            while total < 0 or got < total:
                _kick(kick_wdt)
                piece = sock.recv(512)
                if not piece:
                    break
                if total >= 0 and got + len(piece) > total:
                    piece = piece[: total - got]
                out.write(piece)
                if hasher:
                    hasher.update(piece)
                got += len(piece)
        if total >= 0 and got != total:
            log_error("short read {} {}/{}".format(path, got, total))
            _remove(dest)
            return False
        if hasher and expected:
            digest = hasher.hexdigest()
            if digest.lower() != str(expected).strip().lower():
                log_error("checksum mismatch {}".format(path))
                _remove(dest)
                return False
        return True
    except Exception as exc:
        log_error("stream {}: {}".format(path, exc))
        _remove(dest)
        return False
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass


def _compile_saved(name, path, kick_wdt):
    try:
        size = os.stat(path)[6]
    except Exception:
        size = 0
    if size > 16384:
        return True
    return _syntax_ok(name, _read_text(path), kick_wdt)


def _restore_backup(name):
    if str(name).endswith(".py"):
        bak = name[:-3] + "_backup.py"
    else:
        bak = name + ".bak"
    if not _exists(bak):
        return
    try:
        _copy_file(bak, name)
    except Exception as exc:
        log_error("restore {}: {}".format(name, exc))


def _replace_from_temp(name, tmp, kick_wdt):
    _kick(kick_wdt)
    if str(name).endswith(".py"):
        bak = name[:-3] + "_backup.py"
    else:
        bak = name + ".bak"
    if _exists(name):
        try:
            _copy_file(name, bak)
        except Exception as exc:
            log_error("backup {}: {}".format(name, exc))
            return False
    try:
        _copy_file(tmp, name)
    except Exception as exc:
        log_error("replace {}: {}".format(name, exc))
        _restore_backup(name)
        return False
    _remove(tmp)
    try:
        import gc

        gc.collect()
    except Exception:
        pass
    return True


def _version_parts(text):
    """1.2.30 や v1.2.30 を数値の並びにする。壊れていれば None。"""
    parts = []
    raw = str(text or "").strip().lstrip("vV")
    if not raw:
        return None
    for piece in raw.split("."):
        num = ""
        for ch in piece:
            if ch.isdigit():
                num += ch
            else:
                break
        if not num:
            return None
        parts.append(int(num))
    if not parts:
        return None
    return tuple(parts)


def _version_is_newer(local, remote):
    """手元が配信より新しいとき True。ダウングレード OTA を止める。"""
    left = _version_parts(local)
    right = _version_parts(remote)
    if not left or not right:
        return False
    width = max(len(left), len(right))
    left = left + (0,) * (width - len(left))
    right = right + (0,) * (width - len(right))
    return left > right


def maybe_update(
    http_get,
    config=None,
    kick_wdt=None,
    force=False,
    reported_version=None,
):
    """
    DHCP 直後または HB 応答後に呼ぶ。
    新版があれば検証→退避→置換→reset。
    """
    try:
        return _run_update(
            http_get, config, kick_wdt, force, reported_version
        )
    except Exception as exc:
        log_error("update: {}".format(exc))
        return False


def _run_update(http_get, config, kick_wdt, force, reported_version):
    _kick(kick_wdt)
    slug = site_slug(config)
    channel = ota_channel(config)
    running = str(reported_version or "").strip()
    if not running:
        running = _running_logic_version(config)
    current = running or local_version(config)
    path = (
        "/api/firmware/{}/version?channel={}&firmware_version={}"
        "&ota_engine=stream".format(slug, channel, current)
    )
    body, status = http_get(path)
    if status != 200 or not body:
        log("version check skip HTTP {}".format(status))
        return False
    try:
        meta = json.loads(body)
    except Exception as exc:
        log_error("version json: {}".format(exc))
        return False
    if not isinstance(meta, dict):
        return False
    remote_ver = str(meta.get("version") or "").strip()
    if (
        remote_ver
        and current
        and _version_is_newer(current, remote_ver)
        and not meta.get("force")
    ):
        log("local {} newer than {} — skip".format(current, remote_ver))
        return False
    has_update = bool(meta.get("has_ota_update") or force)
    if meta.get("force") or meta.get("update_required"):
        has_update = True
    if running and remote_ver and running != remote_ver:
        has_update = True
    if not has_update:
        return False
    if remote_ver and current and remote_ver == current and not meta.get("force"):
        log("already current {}".format(current))
        return False
    # 転送中の WDT で、直前に入ったファイルまで戻さない
    _remove(OTA_PENDING_FILE)
    _remove(OTA_BOOT_STARTED)
    files = meta.get("files") or list(DEFAULT_FILES)
    skip = meta.get("skipFiles") or list(SKIP_FILES)
    checksums = meta.get("checksums") or {}
    log("update {} -> {}".format(current, remote_ver or "?"))
    temps = []
    for name in files:
        if name in skip:
            continue
        _kick(kick_wdt)
        script_path = (
            "/api/firmware/{}/script?name={}&channel={}".format(
                slug, name, channel
            )
        )
        expected = ""
        if isinstance(checksums, dict):
            expected = checksums.get(name) or ""
        tmp = _tmp_path(name)
        if machine is not None:
            if not _stream_download(
                script_path, tmp, expected, config, kick_wdt
            ):
                _cleanup_temps(temps)
                return False
            if not _compile_saved(name, tmp, kick_wdt):
                _remove(tmp)
                _cleanup_temps(temps)
                return False
        else:
            text, code = http_get(script_path)
            if code != 200 or text is None:
                log_error("download fail {} HTTP {}".format(name, code))
                _cleanup_temps(temps)
                return False
            if not _checksum_ok(text, expected):
                log_error("checksum mismatch {}".format(name))
                _cleanup_temps(temps)
                return False
            if not _syntax_ok(name, text, kick_wdt):
                _cleanup_temps(temps)
                return False
            _write_text(tmp, text)
        temps.append((name, tmp))
    if not temps:
        log("no files to apply")
        return False
    applied = []
    for name, tmp in temps:
        if not _replace_from_temp(name, tmp, kick_wdt):
            log_error("apply failed {}".format(name))
            for done in applied:
                _restore_backup(done)
            _cleanup_temps(temps)
            _remove(OTA_PENDING_FILE)
            return False
        applied.append(name)
    _write_text(OTA_PENDING_FILE, remote_ver or current)
    _remove(OTA_BOOT_STARTED)
    state = load_ota_state()
    state["version"] = remote_ver or current
    state["ok"] = False
    save_ota_state(state)
    log("applied {} - reset".format(state["version"]))
    _reset()
    return True

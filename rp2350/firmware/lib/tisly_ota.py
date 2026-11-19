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
# 物理 WDT は 8000ms。ソケットの待ちは 4 秒で切り、
# 受信と書き込みの合間に feed してリセットを避ける。
OTA_SOCKET_TIMEOUT_SEC = 4
OTA_DOWNLOAD_TRIES = 2


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


def _copy_file(src, dst, kick_wdt=None):
    """512 バイトずつ写す。全文を RAM に載せない。

    ブロックを書く前後で WDT を給餌する。
    大きいスクリプトの退避でも 8 秒で落ちない。
    """
    parent = dst.rfind("/")
    if parent > 0:
        folder = dst[:parent]
        try:
            os.mkdir(folder)
        except Exception:
            pass
    _kick(kick_wdt)
    with open(src, "rb") as src_f:
        with open(dst, "wb") as dst_f:
            while True:
                _kick(kick_wdt)
                buf = src_f.read(512)
                if not buf:
                    break
                dst_f.write(buf)
    _kick(kick_wdt)


def _remove(path):
    try:
        os.remove(path)
    except Exception:
        pass


def _mark_ota_reboot():
    """置換が終わってから再起動の旗を書く。"""
    try:
        from tisly_do_guard import mark_ota_reset
    except ImportError:
        try:
            from lib.tisly_do_guard import mark_ota_reset
        except ImportError:
            mark_ota_reset = None
    if mark_ota_reset:
        try:
            mark_ota_reset()
            return
        except Exception:
            pass
    try:
        handle = open(".ota_reboot", "w")
        try:
            handle.write("OTA")
        finally:
            handle.close()
    except Exception:
        pass


def _reset():
    """旗を残してから基板を再起動する。"""
    _mark_ota_reboot()
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


def _flag_true(value):
    """真偽のゆらぎを真にする。文字列の true も受ける。"""
    if value is True:
        return True
    if value is False or value is None:
        return False
    text = str(value).strip().lower()
    return text in ("1", "true", "yes", "on")


def has_ota_update_from_body(body):
    if not body:
        return False
    if isinstance(body, (bytes, bytearray)):
        try:
            body = body.decode("utf-8", "replace")
        except Exception:
            return False
    try:
        data = json.loads(body)
    except Exception:
        return False
    if not isinstance(data, dict):
        return False
    if _flag_true(data.get("has_ota_update")) or _flag_true(
        data.get("update_required")
    ):
        return True
    if _flag_true(data.get("pending")) and _flag_true(
        data.get("update_required")
    ):
        return True
    ota = data.get("ota")
    if isinstance(ota, dict) and (
        _flag_true(ota.get("has_ota_update"))
        or _flag_true(ota.get("update_required"))
    ):
        return True
    return False


def _query_escape(text):
    """クエリのスラッシュを %2F にする。経路の分断を防ぐ。"""
    out = []
    for ch in str(text):
        code = ord(ch)
        if (
            48 <= code <= 57
            or 65 <= code <= 90
            or 97 <= code <= 122
            or ch in "._-"
        ):
            out.append(ch)
        else:
            out.append("%{:02X}".format(code))
    return "".join(out)


def _sha_hex(hasher):
    """hexdigest が bytes でも 16 進文字列に揃える。"""
    if hasher is None:
        return ""
    raw = None
    try:
        raw = hasher.hexdigest()
    except Exception:
        raw = None
    if raw is None:
        try:
            digest = hasher.digest()
            parts = []
            for byte in digest:
                parts.append("{:02x}".format(byte))
            return "".join(parts)
        except Exception:
            return ""
    if isinstance(raw, bytes):
        try:
            raw = raw.decode("ascii")
        except Exception:
            return ""
    return str(raw).strip().lower()


def _syntax_ok(name, text, kick_wdt=None):
    """compile の直前と直後に給餌する。

    compile 自体は途中で feed できない。
    前後を蹴って、待ちが 8 秒を超えないようにする。
    """
    _kick(kick_wdt)
    if name.endswith(".py") is False:
        _kick(kick_wdt)
        return True
    try:
        compile(text, name, "exec")
        return True
    except Exception as exc:
        log_error("syntax {}: {}".format(name, exc))
        return False
    finally:
        _kick(kick_wdt)


def _checksum_ok(text, expected):
    if not expected:
        return True
    try:
        import hashlib

        got = hashlib.sha256(text.encode("utf-8")).hexdigest()
        return got == expected
    except Exception:
        return True


def _py_broken(path):
    """構文エラーの py だけ壊れているとみなす。

    メモリ不足は壊れていない。誤って戻さない。
    ファイルが無いときは戻す対象にする。
    """
    if not _exists(path):
        return True
    try:
        import gc

        gc.collect()
    except Exception:
        pass
    try:
        text = _read_text(path)
        compile(text, path, "exec")
        return False
    except MemoryError:
        return False
    except Exception:
        return True


def recover_if_needed():
    """
    起動直後の文鎮化防止。
    前回 OTA 後に main が落ちていれば
    main_backup.py から復元して再起動する。
    構文エラーも、起動前にバックアップへ戻す。
    """
    pending = _exists(OTA_PENDING_FILE)
    if not pending:
        _remove(OTA_BOOT_STARTED)
        return False
    crashed = _exists(OTA_BOOT_STARTED) or _py_broken("main.py")
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
    _kick(kick_wdt)
    if _exists(name):
        try:
            _copy_file(name, bak, kick_wdt)
        except Exception as exc:
            log_error("backup {}: {}".format(name, exc))
            return False
    _kick(kick_wdt)
    _copy_file(tmp, name, kick_wdt)
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


def _write_chunked(first, read, write, hasher):
    """chunked 本文を write へ流す。ファイル全体は持たない。"""
    buf = first if first else b""
    if isinstance(buf, str):
        buf = buf.encode("latin-1")
    while True:
        while buf.find(b"\r\n") < 0:
            piece = read()
            if not piece:
                return False
            buf += piece
            if len(buf) > 65536:
                return False
        line, buf = buf.split(b"\r\n", 1)
        size_txt = line.split(b";", 1)[0].strip()
        if not size_txt:
            return False
        try:
            size = int(size_txt, 16)
        except Exception:
            return False
        if size < 0:
            return False
        if size == 0:
            return True
        need = size + 2
        while len(buf) < need:
            piece = read()
            if not piece:
                return False
            buf += piece
        block = buf[:size]
        tail = buf[size : size + 2]
        buf = buf[size + 2 :]
        if tail != b"\r\n":
            return False
        write(block)
        if hasher:
            hasher.update(block)
    return False


def _arm_socket_timeout(sock=None):
    """名前解決も受信も 4 秒で打ち切る。

    既定の無限待ちだと、WDT の 8 秒に届く前に
    給餌できず基板がリセットされる。
    """
    try:
        import socket

        socket.setdefaulttimeout(OTA_SOCKET_TIMEOUT_SEC)
    except Exception:
        pass
    if sock is None:
        return
    try:
        sock.settimeout(OTA_SOCKET_TIMEOUT_SEC)
    except Exception:
        pass


def _socket_get_text(path, config, kick_wdt):
    """版 JSON を短い待ちで取る。失敗は例外にしない。"""
    import socket

    host, port, use_ssl = _api_parts(config)
    token = ""
    if config is not None:
        token = str(getattr(config, "REMOTE_TEST_TOKEN", "") or "")
    sock = None
    try:
        _kick(kick_wdt)
        try:
            import gc

            gc.collect()
        except Exception:
            pass
        _kick(kick_wdt)
        _arm_socket_timeout()
        infos = socket.getaddrinfo(host, port, 0, socket.SOCK_STREAM)
        addr = infos[0][-1]
        sock = socket.socket()
        _arm_socket_timeout(sock)
        _kick(kick_wdt)
        sock.connect(addr)
        _kick(kick_wdt)
        if use_ssl:
            import ssl

            try:
                sock = ssl.wrap_socket(sock, server_hostname=host)
            except TypeError:
                sock = ssl.wrap_socket(sock)
            _arm_socket_timeout(sock)
            _kick(kick_wdt)
        req = (
            "GET {} HTTP/1.0\r\n"
            "Host: {}\r\n"
            "Accept-Encoding: identity\r\n"
            "Connection: close\r\n"
            "X-Remote-Test-Token: {}\r\n"
            "\r\n"
        ).format(path, host, token)
        sock.send(req.encode("ascii", "ignore"))
        raw = b""
        while len(raw) < 262144:
            _kick(kick_wdt)
            try:
                piece = sock.recv(512)
            except Exception:
                break
            if not piece:
                break
            raw += piece
        sep = raw.find(b"\r\n\r\n")
        if sep < 0:
            return None, 0
        head = raw[:sep].decode("latin-1")
        body = raw[sep + 4 :]
        parts = head.split("\r\n", 1)[0].split()
        status = 0
        if len(parts) >= 2:
            try:
                status = int(parts[1])
            except Exception:
                status = 0
        _kick(kick_wdt)
        try:
            text = body.decode("utf-8")
        except Exception:
            text = body.decode("latin-1")
        return text, status
    except Exception as exc:
        log_error("version socket: {}".format(exc))
        return None, 0
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass
        _kick(kick_wdt)


def _stream_download(path, dest, expected, config, kick_wdt):
    """受信しながらフラッシュへ書く。待ちの途中で WDT を蹴る。"""
    import socket

    host, port, use_ssl = _api_parts(config)
    token = ""
    if config is not None:
        token = str(getattr(config, "REMOTE_TEST_TOKEN", "") or "")
    sock = None
    try:
        _kick(kick_wdt)
        try:
            import gc

            gc.collect()
        except Exception:
            pass
        _kick(kick_wdt)
        _arm_socket_timeout()
        infos = socket.getaddrinfo(host, port, 0, socket.SOCK_STREAM)
        addr = infos[0][-1]
        sock = socket.socket()
        _arm_socket_timeout(sock)
        _kick(kick_wdt)
        sock.connect(addr)
        _kick(kick_wdt)
        if use_ssl:
            import ssl

            try:
                sock = ssl.wrap_socket(sock, server_hostname=host)
            except TypeError:
                sock = ssl.wrap_socket(sock)
            _arm_socket_timeout(sock)
            _kick(kick_wdt)
        try:
            _arm_socket_timeout(sock)
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
        transfer = str(headers.get("transfer-encoding") or "").lower()
        chunked = transfer.find("chunked") >= 0

        def _recv():
            _kick(kick_wdt)
            try:
                return sock.recv(512)
            except Exception:
                return b""

        def _write_piece(block):
            _kick(kick_wdt)
            out.write(block)
            _kick(kick_wdt)

        with open(dest, "wb") as out:
            if chunked:
                # 長さ無しの分割受信。枠はファイルへ書かない。
                if not _write_chunked(pre, _recv, _write_piece, hasher):
                    log_error("chunked {}".format(path))
                    _remove(dest)
                    return False
            else:
                got = 0
                if pre:
                    if total >= 0 and len(pre) > total:
                        pre = pre[:total]
                    _write_piece(pre)
                    if hasher:
                        hasher.update(pre)
                    got += len(pre)
                while total < 0 or got < total:
                    piece = _recv()
                    if not piece:
                        break
                    if total >= 0 and got + len(piece) > total:
                        piece = piece[: total - got]
                    _write_piece(piece)
                    if hasher:
                        hasher.update(piece)
                    got += len(piece)
                if total >= 0 and got != total:
                    log_error(
                        "short read {} {}/{}".format(path, got, total)
                    )
                    _remove(dest)
                    return False
        if hasher and expected:
            digest = _sha_hex(hasher)
            want = str(expected).strip().lower()
            if digest != want:
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


def _compile_saved(name, path, kick_wdt, trusted=False):
    """保存済み py を compile する。通過するまで置換しない。

    空きが狭いときは MemoryError で更新が止まる。
    チェックサム済みのときだけ、その不足を通す。
    構文エラーはチェックサムがあっても戻す。
    """
    if str(name).endswith(".py") is False:
        return True
    _kick(kick_wdt)
    try:
        import gc

        gc.collect()
    except Exception:
        pass
    _kick(kick_wdt)
    size = 0
    try:
        size = os.stat(path)[6]
    except Exception:
        size = 0
    free = None
    try:
        import gc

        free = gc.mem_free()
    except Exception:
        free = None
    if free is not None and size > 0 and free < (size * 2 + 8192):
        if trusted:
            log(
                "compile defer {} free={} size={}".format(
                    name, free, size
                )
            )
            return True
        log_error("compile ram {}".format(name))
        return False
    try:
        text = _read_text(path)
    except MemoryError:
        if trusted:
            log("compile defer read {}".format(name))
            return True
        log_error("compile read {}".format(name))
        return False
    try:
        _kick(kick_wdt)
        return _syntax_ok(name, text, kick_wdt)
    finally:
        try:
            del text
        except Exception:
            pass
        try:
            import gc

            gc.collect()
        except Exception:
            pass
        _kick(kick_wdt)


def _restore_backup(name, kick_wdt=None):
    if str(name).endswith(".py"):
        bak = name[:-3] + "_backup.py"
    else:
        bak = name + ".bak"
    if not _exists(bak):
        return
    _kick(kick_wdt)
    try:
        _copy_file(bak, name, kick_wdt)
    except Exception as exc:
        log_error("restore {}: {}".format(name, exc))


def _rename_over(src, dst, kick_wdt=None):
    """リネームで差し替える。失敗時だけ分割コピーする。"""
    _kick(kick_wdt)
    _mkdirs_for(dst)
    if _exists(dst):
        _remove(dst)
    _kick(kick_wdt)
    try:
        os.rename(src, dst)
        _kick(kick_wdt)
        return True
    except Exception:
        pass
    try:
        _copy_file(src, dst, kick_wdt)
        _remove(src)
        _kick(kick_wdt)
        return _exists(dst)
    except Exception as exc:
        log_error("move {}: {}".format(dst, exc))
        return False


def _replace_from_temp(name, tmp, kick_wdt):
    _kick(kick_wdt)
    if str(name).endswith(".py"):
        bak = name[:-3] + "_backup.py"
    else:
        bak = name + ".bak"
    if _exists(name):
        _remove(bak)
        _kick(kick_wdt)
        if not _rename_over(name, bak, kick_wdt):
            log_error("backup {}".format(name))
            return False
    _kick(kick_wdt)
    if not _rename_over(tmp, name, kick_wdt):
        log_error("replace {}".format(name))
        _restore_backup(name, kick_wdt)
        return False
    try:
        import gc

        gc.collect()
    except Exception:
        pass
    _kick(kick_wdt)
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
    body, status = None, 0
    # 実機は 4 秒で切るソケット。ホスト試験は渡された http_get。
    # 失敗しても 1 回だけやり直して、無限待ちにはしない。
    version_tries = OTA_DOWNLOAD_TRIES if machine is not None else 1
    for _attempt in range(version_tries):
        _kick(kick_wdt)
        try:
            if machine is not None:
                body, status = _socket_get_text(path, config, kick_wdt)
            else:
                body, status = http_get(path)
        except Exception as exc:
            log_error("version get: {}".format(exc))
            body, status = None, 0
        if status == 200 and body:
            break
        _kick(kick_wdt)
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
    has_update = _flag_true(meta.get("has_ota_update")) or bool(force)
    if _flag_true(meta.get("force")) or _flag_true(
        meta.get("update_required")
    ):
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
        try:
            import gc

            gc.collect()
        except Exception:
            pass
        _kick(kick_wdt)
        script_path = (
            "/api/firmware/{}/script?name={}&channel={}".format(
                slug, _query_escape(name), channel
            )
        )
        expected = ""
        if isinstance(checksums, dict):
            expected = checksums.get(name) or ""
        tmp = _tmp_path(name)
        if machine is not None:
            saved = False
            for _attempt in range(OTA_DOWNLOAD_TRIES):
                _kick(kick_wdt)
                try:
                    if _stream_download(
                        script_path, tmp, expected, config, kick_wdt
                    ):
                        saved = True
                        break
                except Exception as exc:
                    log_error("download {}: {}".format(name, exc))
                _remove(tmp)
                _kick(kick_wdt)
            if not saved:
                _cleanup_temps(temps)
                return False
            if not _compile_saved(
                name, tmp, kick_wdt, trusted=bool(expected)
            ):
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
                _restore_backup(done, kick_wdt)
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

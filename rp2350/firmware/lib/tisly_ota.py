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
    raw = _read_text(OTA_STATE_FILE)
    if not raw:
        return {"version": "1.0.0"}
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {"version": "1.0.0"}


def save_ota_state(state):
    _write_text(OTA_STATE_FILE, json.dumps(state))


def local_version(config=None):
    state = load_ota_state()
    ver = str(state.get("version") or "").strip()
    if ver:
        return ver
    if config is not None:
        ver = str(getattr(config, "OTA_VERSION", "") or "").strip()
        if ver:
            return ver
        ver = str(getattr(config, "FIRMWARE_VERSION", "") or "").strip()
        if ver:
            return ver
    return "1.0.0"


def site_slug(config=None):
    if config is None:
        return "toyoshima"
    raw = str(getattr(config, "OTA_SITE", "") or "").strip()
    if raw:
        return raw
    site = str(getattr(config, "SITE_ID", "") or "").upper()
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
    if data.get("has_ota_update"):
        return True
    ota = data.get("ota")
    if isinstance(ota, dict) and ota.get("has_ota_update"):
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
    ):
        bak = name.replace(".py", "_backup.py")
        if _exists(bak):
            try:
                _copy_file(bak, name)
            except Exception:
                pass
    _remove(OTA_PENDING_FILE)
    _remove(OTA_BOOT_STARTED)
    if restored:
        _reset()
    return restored


def mark_boot_ok(config=None):
    """最初の正常 HB 後に pending を解除する。"""
    state = load_ota_state()
    state["ok"] = True
    if config is not None:
        state["version"] = local_version(config)
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
    _kick(kick_wdt)
    slug = site_slug(config)
    channel = ota_channel(config)
    current = reported_version or local_version(config)
    path = (
        "/api/firmware/{}/version?channel={}&firmware_version={}".format(
            slug, channel, current
        )
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
    has_update = bool(meta.get("has_ota_update") or force)
    if meta.get("force"):
        has_update = True
    if not has_update:
        return False
    if remote_ver and remote_ver == current and not meta.get("force"):
        log("already current {}".format(current))
        return False
    files = meta.get("files") or list(DEFAULT_FILES)
    skip = meta.get("skipFiles") or list(SKIP_FILES)
    checksums = meta.get("checksums") or {}
    log("update {} -> {}".format(current, remote_ver or "?"))
    staged = []
    for name in files:
        if name in skip:
            continue
        _kick(kick_wdt)
        script_path = (
            "/api/firmware/{}/script?name={}&channel={}".format(
                slug, name, channel
            )
        )
        text, code = http_get(script_path)
        if code != 200 or text is None:
            log_error("download fail {} HTTP {}".format(name, code))
            return False
        expected = checksums.get(name)
        if not _checksum_ok(text, expected):
            log_error("checksum mismatch {}".format(name))
            return False
        if not _syntax_ok(name, text, kick_wdt):
            return False
        staged.append((name, text))
    if not staged:
        log("no files to apply")
        return False
    _write_text(OTA_PENDING_FILE, remote_ver or current)
    _remove(OTA_BOOT_STARTED)
    for name, text in staged:
        if not _apply_file(name, text, kick_wdt):
            log_error("apply failed {}".format(name))
            if _exists("main_backup.py"):
                try:
                    _copy_file("main_backup.py", "main.py")
                except Exception:
                    pass
            _remove(OTA_PENDING_FILE)
            return False
    state = load_ota_state()
    state["version"] = remote_ver or current
    state["ok"] = False
    save_ota_state(state)
    log("applied {} - reset".format(state["version"]))
    _reset()
    return True

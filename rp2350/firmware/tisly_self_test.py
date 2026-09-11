"""
TiSLY RP2350 出荷前セルフ診断

起動時に設定・LAN・初回HB・OTA を検査し、
RGB 色と shippable.json へ永続化する。
既存 config.py は削除せず、欠けていれば
config.json を生成する（上書きしない）。
"""

import json

try:
    import os
except ImportError:
    os = None

try:
    import time
except ImportError:
    time = None

try:
    from tisly_rgb import (
        STATUS_CONFIGURED,
        STATUS_FAULT,
        STATUS_SHIPPABLE,
        STATUS_UNCONFIGURED,
        init_rgb,
        set_status as rgb_set_status,
        tick as rgb_tick,
    )
except ImportError:
    try:
        from lib.tisly_rgb import (
            STATUS_CONFIGURED,
            STATUS_FAULT,
            STATUS_SHIPPABLE,
            STATUS_UNCONFIGURED,
            init_rgb,
            set_status as rgb_set_status,
            tick as rgb_tick,
        )
    except ImportError:
        STATUS_UNCONFIGURED = "UNCONFIGURED"
        STATUS_FAULT = "FAULT"
        STATUS_CONFIGURED = "CONFIGURED"
        STATUS_SHIPPABLE = "SHIPPABLE"
        init_rgb = None
        rgb_set_status = None
        rgb_tick = None

STATE_FILE = "shippable.json"
CONFIG_JSON = "config.json"
HEALTH_PATH = "/api/health"


def log(msg):
    try:
        print("[TiSLY KIT]", msg)
    except Exception:
        print("[TiSLY KIT]", str(msg).encode("ascii", "replace"))


def _exists(path):
    if os is None:
        return False
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
    try:
        with open(path, "w") as f:
            f.write(text)
        return True
    except Exception:
        return False


def _read_json(path):
    raw = _read_text(path)
    if not raw:
        return None
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except Exception:
        return None
    return None


def load_persisted():
    """出荷フラグを読み出す（無ければ空）。"""
    data = _read_json(STATE_FILE)
    if not data:
        return {
            "shippable": False,
            "rgb_status": STATUS_UNCONFIGURED,
            "checks": {},
        }
    return data


def save_persisted(state):
    """検査結果を永続化する（既存キーは残す）。"""
    prev = load_persisted()
    merged = dict(prev)
    merged.update(state or {})
    stamp = ""
    if time is not None:
        try:
            stamp = str(int(time.time()))
        except Exception:
            stamp = ""
    merged["updatedAt"] = stamp
    body = json.dumps(merged)
    return _write_text(STATE_FILE, body)


def _site_from_config(config):
    if config is None:
        return ""
    for key in ("OTA_SITE", "SITE_ID", "HOME_SITE_ID", "TENANT_ID"):
        val = str(getattr(config, key, "") or "").strip()
        if val:
            return val
    return ""


def _name_from_config(config):
    if config is None:
        return ""
    site = str(getattr(config, "OTA_SITE", "") or "").strip().lower()
    if site == "toyoshima":
        return "toyoshima"
    if site == "itabashi":
        return "itabashi"
    for key in ("TENANT_ID", "SITE_ID", "DEVICE_ID"):
        val = str(getattr(config, key, "") or "").strip()
        if val:
            return val
    return ""


def _sensors_from_config(config):
    sensors = {}
    if config is None:
        return sensors
    di = getattr(config, "DI_GPIO", None)
    if isinstance(di, dict):
        for key, gpio in di.items():
            sensors["DI{}".format(key)] = "gpio{}".format(gpio)
    return sensors


def _ota_endpoint_from_config(config):
    if config is None:
        return ""
    base = str(getattr(config, "API_BASE", "") or "").rstrip("/")
    slug = str(getattr(config, "OTA_SITE", "") or "").strip()
    if not slug:
        slug = _site_from_config(config)
    if not base:
        base = "https://tisly.jp"
    if not slug:
        return "{}/api/firmware".format(base)
    return "{}/api/firmware/{}".format(base, slug)


def build_config_json_from_py(config):
    """config.py から検査用 JSON を組み立てる。"""
    site_id = _site_from_config(config)
    site_name = _name_from_config(config)
    sensors = _sensors_from_config(config)
    endpoint = _ota_endpoint_from_config(config)
    return {
        "site_id": site_id,
        "site_name": site_name,
        "sensors": sensors,
        "ota": {
            "endpoint": endpoint,
            "site": str(getattr(config, "OTA_SITE", site_id) or site_id),
        },
    }


def ensure_config_json(config=None):
    """既存 JSON は残し、無いときだけ生成する。"""
    if _exists(CONFIG_JSON):
        return _read_json(CONFIG_JSON)
    data = build_config_json_from_py(config)
    if data.get("site_id") and data.get("sensors"):
        _write_text(CONFIG_JSON, json.dumps(data))
    return data


def _ota_ok(blob):
    if not isinstance(blob, dict):
        return False
    ota = blob.get("ota")
    if isinstance(ota, dict):
        endpoint = str(ota.get("endpoint") or "").strip()
        site = str(ota.get("site") or ota.get("site_id") or "").strip()
        if "firmware" in endpoint.lower() or site:
            return True
    endpoint = str(blob.get("ota_endpoint") or "").strip()
    return "firmware" in endpoint.lower()


def validate_config_blob(blob):
    """site_id / site_name / sensors / OTA を検査。"""
    if not isinstance(blob, dict):
        return False
    site_id = str(blob.get("site_id") or blob.get("siteId") or "").strip()
    site_name = str(
        blob.get("site_name") or blob.get("siteName") or site_id
    ).strip()
    sensors = blob.get("sensors")
    has_sensors = False
    if isinstance(sensors, dict) and len(sensors) > 0:
        has_sensors = True
    elif isinstance(sensors, list) and len(sensors) > 0:
        has_sensors = True
    if not site_id or not site_name or not has_sensors:
        return False
    return _ota_ok(blob)


def check_config(config=None):
    """config.json 優先。無ければ config.py で代替。"""
    blob = None
    if _exists(CONFIG_JSON):
        blob = _read_json(CONFIG_JSON)
        if validate_config_blob(blob):
            return True, blob
    derived = build_config_json_from_py(config)
    if validate_config_blob(derived):
        ensure_config_json(config)
        return True, derived
    return False, derived


def check_lan(connected, http_get=None, kick_wdt=None):
    """DHCP 取得後に tisly.jp へ HTTP 疎通。"""
    if not connected:
        return False
    if not http_get:
        return True
    try:
        if kick_wdt:
            kick_wdt()
        body, status = http_get(HEALTH_PATH)
        if int(status or 0) == 200:
            return True
        if body:
            return True
    except Exception as exc:
        log("lan http: {}".format(exc))
        return False
    return False


def check_ota(http_get, config=None, kick_wdt=None):
    """OTA version API が JSON を返すか。"""
    if not http_get:
        return False
    slug = ""
    if config is not None:
        slug = str(getattr(config, "OTA_SITE", "") or "").strip()
    if not slug:
        ok, blob = check_config(config)
        if ok and isinstance(blob, dict):
            ota = blob.get("ota") if isinstance(blob.get("ota"), dict) else {}
            slug = str(ota.get("site") or blob.get("site_id") or "").strip()
    if not slug:
        slug = "toyoshima"
    path = "/api/firmware/{}/version".format(slug)
    try:
        if kick_wdt:
            kick_wdt()
        body, status = http_get(path)
        if int(status or 0) != 200 or not body:
            return False
        meta = json.loads(body)
        return isinstance(meta, dict) and bool(meta.get("version") or meta.get("ok"))
    except Exception as exc:
        log("ota check: {}".format(exc))
        return False


def evaluate_status(checks, persisted=None):
    """
    検査結果から RGB ステータスを決める。
    永続フラグあり: オフラインは青、疎通で緑。
    """
    cfg = bool(checks.get("config"))
    lan = bool(checks.get("lan"))
    hb = bool(checks.get("heartbeat"))
    ota = bool(checks.get("ota"))
    was = False
    if isinstance(persisted, dict):
        was = bool(persisted.get("shippable"))
    if not cfg:
        return STATUS_UNCONFIGURED, False
    if was:
        if lan:
            return STATUS_SHIPPABLE, True
        return STATUS_CONFIGURED, True
    if not lan:
        return STATUS_CONFIGURED, False
    if hb and ota:
        return STATUS_SHIPPABLE, True
    return STATUS_CONFIGURED, False


class SelfTestRunner:
    """起動〜HB までの出荷判定オーケストレーション。"""

    def __init__(self, config=None, http_get=None, kick_wdt=None):
        self.config = config
        self.http_get = http_get
        self.kick_wdt = kick_wdt
        self.checks = {
            "config": False,
            "lan": False,
            "heartbeat": False,
            "ota": False,
        }
        self.persisted = load_persisted()
        self.status = STATUS_UNCONFIGURED
        self.shippable = bool(self.persisted.get("shippable"))
        if init_rgb:
            try:
                init_rgb(config)
            except Exception:
                pass

    def apply_rgb(self):
        if rgb_set_status:
            try:
                rgb_set_status(self.status)
            except Exception:
                pass
        return self.status

    def refresh_status(self):
        status, shippable = evaluate_status(self.checks, self.persisted)
        self.status = status
        self.shippable = shippable
        if shippable:
            save_persisted(
                {
                    "shippable": True,
                    "rgb_status": status,
                    "checks": dict(self.checks),
                }
            )
            self.persisted["shippable"] = True
        else:
            save_persisted(
                {
                    "shippable": bool(self.persisted.get("shippable")),
                    "rgb_status": status,
                    "checks": dict(self.checks),
                }
            )
        self.apply_rgb()
        return self.status

    def run_config(self):
        ok, _blob = check_config(self.config)
        self.checks["config"] = bool(ok)
        if not ok:
            self.status = STATUS_UNCONFIGURED
            self.apply_rgb()
            log("config missing or incomplete")
            return False
        self.refresh_status()
        log("config ok")
        return True

    def run_lan(self, connected):
        ok = check_lan(connected, self.http_get, self.kick_wdt)
        self.checks["lan"] = bool(ok)
        if self.checks["config"] and not ok:
            self.status = STATUS_CONFIGURED
            self.apply_rgb()
            log("waiting network")
            return False
        if not self.checks["config"] and not ok:
            self.status = STATUS_FAULT
            self.apply_rgb()
            return False
        self.refresh_status()
        log("lan ok" if ok else "lan fail")
        return ok

    def run_ota(self):
        ok = check_ota(self.http_get, self.config, self.kick_wdt)
        self.checks["ota"] = bool(ok)
        self.refresh_status()
        log("ota ok" if ok else "ota pending")
        return ok

    def note_heartbeat(self, ok):
        self.checks["heartbeat"] = bool(ok)
        if not ok and self.checks["config"]:
            if self.shippable:
                self.status = STATUS_CONFIGURED
                self.apply_rgb()
            else:
                self.status = STATUS_FAULT
                self.apply_rgb()
            log("heartbeat fail")
            return False
        self.refresh_status()
        log("heartbeat ok" if ok else "heartbeat fail")
        return ok

    def tick(self, now_ms=None):
        if rgb_tick:
            try:
                rgb_tick(now_ms)
            except Exception:
                pass

    def payload_fields(self):
        """HB JSON に付与する出荷判定フィールド。"""
        return {
            "shippable": bool(self.shippable),
            "rgb_status": self.status,
            "self_test": {
                "config": bool(self.checks.get("config")),
                "lan": bool(self.checks.get("lan")),
                "heartbeat": bool(self.checks.get("heartbeat")),
                "ota": bool(self.checks.get("ota")),
            },
        }


_runner = None


def get_runner(config=None, http_get=None, kick_wdt=None):
    global _runner
    if _runner is None:
        _runner = SelfTestRunner(config, http_get, kick_wdt)
    else:
        if config is not None:
            _runner.config = config
        if http_get is not None:
            _runner.http_get = http_get
        if kick_wdt is not None:
            _runner.kick_wdt = kick_wdt
    return _runner


def reset_runner_for_test():
    global _runner
    _runner = None

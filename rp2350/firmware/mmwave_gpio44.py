"""板橋自宅 GPIO44 のミリ波レーダー。

HLK-LD2410C の OUT を High level で受ける。
DI1〜DI8 と DO の端子はここでは触らない。
"""

try:
    import time
except ImportError:
    time = None

GPIO_NUM = 44
DEBOUNCE_MS = 100
RETRY_MS = 2000
DEFAULT_DWELL_SEC = 3
SAMPLE_MS = 2000

_PIN = None
_PIN_ERROR = ""
_PENDING = None
_STATE = {
    "raw": None,
    "raw_since": 0,
    "stable": None,
    "high_since": 0,
    "approach_sent": False,
    "dwell_sent": False,
    "clear_sent": True,
    "next_try": 0,
    "level_at": 0,
    "sample_at": 0,
}


def _ticks():
    if time is None:
        return 0
    return time.ticks_ms()


def _diff(now_ms, then_ms):
    ticks = getattr(time, "ticks_diff", None) if time else None
    if ticks is None:
        return now_ms - then_ms
    return ticks(now_ms, then_ms)


def clamp_dwell_sec(sec):
    try:
        n = int(sec)
    except Exception:
        n = DEFAULT_DWELL_SEC
    if n < 1:
        n = 1
    if n > 300:
        n = 300
    return n


def reset_state_for_test():
    """ホスト試験用。実機のピンは消さない。"""
    global _PENDING, _PIN_ERROR
    _STATE["raw"] = None
    _STATE["raw_since"] = 0
    _STATE["stable"] = None
    _STATE["high_since"] = 0
    _STATE["approach_sent"] = False
    _STATE["dwell_sent"] = False
    _STATE["clear_sent"] = True
    _STATE["next_try"] = 0
    _STATE["level_at"] = 0
    _STATE["sample_at"] = 0
    _PIN_ERROR = ""
    _PENDING = None


def ensure_pin():
    """プルダウン入力。失敗してもループは続ける。"""
    global _PIN, _PIN_ERROR
    if _PIN is not None:
        return _PIN
    if _PIN_ERROR:
        return None
    try:
        from machine import Pin
        _PIN = Pin(GPIO_NUM, Pin.IN, Pin.PULL_DOWN)
        _PIN_ERROR = ""
    except Exception as exc:
        _PIN = None
        _PIN_ERROR = "{}".format(exc)[:120]
    return _PIN


def step_level(level, now_ms, dwell_ms, debounce_ms=DEBOUNCE_MS):
    """確定したレベルから、送るイベントを1つ返す。

    HIGH の立上りは接近。連続 HIGH が滞留秒を超えたら滞留。
    LOW に戻るまで、同じイベントは返さない。
    """
    state = _STATE
    lvl = 1 if level else 0
    if state["raw"] != lvl:
        state["raw"] = lvl
        state["raw_since"] = now_ms
        return None
    if _diff(now_ms, state["raw_since"]) < debounce_ms:
        return None
    if state["stable"] is None:
        state["stable"] = lvl
        if lvl == 1:
            state["high_since"] = now_ms
            state["approach_sent"] = True
            state["dwell_sent"] = False
            state["clear_sent"] = False
            return "approach"
        state["clear_sent"] = True
        return None
    if lvl == state["stable"]:
        if (
            lvl == 1
            and state["approach_sent"]
            and not state["dwell_sent"]
            and _diff(now_ms, state["high_since"]) >= dwell_ms
        ):
            state["dwell_sent"] = True
            return "dwell"
        return None
    state["stable"] = lvl
    if lvl == 1:
        state["high_since"] = now_ms
        state["approach_sent"] = True
        state["dwell_sent"] = False
        state["clear_sent"] = False
        return "approach"
    state["approach_sent"] = False
    state["dwell_sent"] = False
    if state["clear_sent"]:
        return None
    state["clear_sent"] = True
    return "clear"


def _firmware_version():
    """動いている 1.6 系。失敗時は 1.6.15。"""
    try:
        import security_light
        ver = str(
            getattr(security_light, "FIRMWARE_LOGIC_VERSION", "") or ""
        ).strip()
        if ver:
            return ver
    except Exception:
        pass
    return "1.6.15"


def _read_level():
    global _PIN_ERROR
    pin = ensure_pin()
    if pin is None:
        return None
    try:
        return 1 if pin.value() else 0
    except Exception as exc:
        _PIN_ERROR = "{}".format(exc)[:120]
        return None


def diagnostic():
    """生値・初期化エラー・稼働版。例外は空で返す。"""
    global _PIN_ERROR
    try:
        level = _read_level()
    except Exception as exc:
        level = None
        _PIN_ERROR = "{}".format(exc)[:120]
    if level is not None:
        _STATE["raw"] = level
    return {
        "gpio44": level,
        "gpio44Level": level,
        "gpio44Error": _PIN_ERROR or "",
        "firmwareVersion": _firmware_version(),
    }


def _held_ms(now_ms):
    if _STATE["stable"] != 1:
        return 0
    return max(0, _diff(now_ms, _STATE["high_since"]))


def _post_event(post, kick, event, dwell_sec, config, now_ms):
    kick()
    site = "HOME-JP-ITABASHI-LIVE"
    device = "rp2350-itabashi-main-01"
    try:
        site = str(getattr(config, "SITE_ID", site) or site)
        device = str(getattr(config, "DEVICE_ID", device) or device)
    except Exception:
        pass
    raw = _STATE["raw"]
    if raw is None and _STATE["stable"] is not None:
        raw = _STATE["stable"]
    payload = {
        "sensor_id": "mmwave_gpio44",
        "event": event,
        "dwellSec": int(dwell_sec),
        "mmwaveHoldSeconds": int(dwell_sec),
        "level": raw,
        "gpio44": raw,
        "gpio44Level": raw,
        "gpio44Error": _PIN_ERROR or "",
        "firmwareVersion": _firmware_version(),
        "heldMs": int(_held_ms(now_ms)),
        "deviceId": device,
        "siteId": site,
    }
    try:
        _body, status = post("/api/home/v1/itabashi/mmwave", payload)
    except Exception:
        kick()
        return False
    kick()
    return int(status or 0) == 200


def _post_sample(post, kick, dwell_sec, config, now_ms):
    """LOW や初期化失敗でも、約2秒に1回だけ生値を送る。"""
    if _diff(now_ms, _STATE["sample_at"]) < SAMPLE_MS:
        return
    _STATE["sample_at"] = now_ms
    try:
        _post_event(post, kick, "sample", dwell_sec, config, now_ms)
    except Exception:
        kick()


def poll(post, kick, arm_lights, dwell_sec, config, now_ms=None, level=None):
    """1周分。待ちは入れない。失敗は 2 秒後に同じイベント。"""
    global _PENDING
    kick()
    now = _ticks() if now_ms is None else now_ms
    dwell = clamp_dwell_sec(dwell_sec)
    if _PENDING is not None:
        if _diff(now, _STATE["next_try"]) < 0:
            return None
        if _post_event(post, kick, _PENDING, dwell, config, now):
            event = _PENDING
            _PENDING = None
            if event == "dwell":
                try:
                    arm_lights()
                except Exception:
                    pass
            return event
        _STATE["next_try"] = now + RETRY_MS
        return None
    if level is None:
        level = _read_level()
    if level is None:
        _post_sample(post, kick, dwell, config, now)
        return None
    _STATE["raw"] = 1 if level else 0
    event = step_level(level, now, dwell * 1000)
    if not event:
        _post_sample(post, kick, dwell, config, now)
        return None
    if _post_event(post, kick, event, dwell, config, now):
        if event == "dwell":
            try:
                arm_lights()
            except Exception:
                pass
        return event
    _PENDING = event
    _STATE["next_try"] = now + RETRY_MS
    return None

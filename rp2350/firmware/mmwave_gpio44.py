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
DEFAULT_DWELL_SEC = 5

_PIN = None
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
    global _PENDING
    _STATE["raw"] = None
    _STATE["raw_since"] = 0
    _STATE["stable"] = None
    _STATE["high_since"] = 0
    _STATE["approach_sent"] = False
    _STATE["dwell_sent"] = False
    _STATE["clear_sent"] = True
    _STATE["next_try"] = 0
    _STATE["level_at"] = 0
    _PENDING = None


def ensure_pin():
    """プルダウン入力。失敗してもループは続ける。"""
    global _PIN
    if _PIN is not None:
        return _PIN
    try:
        from machine import Pin
        _PIN = Pin(GPIO_NUM, Pin.IN, Pin.PULL_DOWN)
    except Exception:
        _PIN = None
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


def _read_level():
    pin = ensure_pin()
    if pin is None:
        return None
    try:
        return 1 if pin.value() else 0
    except Exception:
        return None


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
    payload = {
        "sensor_id": "mmwave_gpio44",
        "label": "ミリ波レーダー（GPIO44）",
        "event": event,
        "dwellSec": int(dwell_sec),
        "mmwaveHoldSeconds": int(dwell_sec),
        "level": 1 if _STATE["stable"] == 1 else 0,
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
        return None
    event = step_level(level, now, dwell * 1000)
    if not event:
        if (
            _STATE["stable"] == 1
            and _diff(now, _STATE["level_at"]) >= 1000
        ):
            _STATE["level_at"] = now
            _post_event(post, kick, "level", dwell, config, now)
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

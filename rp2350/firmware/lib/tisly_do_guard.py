"""
全物件のリレー安全。
起動時は全出力を切り、
連続ONは種類ごとの上限で切る。
"""

LOCK_LIMIT_SEC = 5
ALARM_LIMIT_SEC = 180
LIGHT_LIMIT_SEC = 600
OTA_RESET_FLAG = ".ota_reboot"
# 配信前の版が書いた旗も、起動時は OTA として読む。
_OTA_FLAG_NAMES = (
    ".ota_reboot",
    "tisly_ota_reset.flag",
)

# None は冷却ファン。温度制御を優先して切らない。
_LIMITS = {
    "itabashi": {
        1: LOCK_LIMIT_SEC,
        2: LIGHT_LIMIT_SEC,
        3: LIGHT_LIMIT_SEC,
        4: ALARM_LIMIT_SEC,
        5: ALARM_LIMIT_SEC,
        6: ALARM_LIMIT_SEC,
        7: ALARM_LIMIT_SEC,
        8: None,
    },
    "toyoshima": {
        1: LIGHT_LIMIT_SEC,
        2: LIGHT_LIMIT_SEC,
        3: ALARM_LIMIT_SEC,
        4: ALARM_LIMIT_SEC,
        5: ALARM_LIMIT_SEC,
        6: ALARM_LIMIT_SEC,
        7: ALARM_LIMIT_SEC,
        8: ALARM_LIMIT_SEC,
    },
    "ryugasaki": {
        1: ALARM_LIMIT_SEC,
        2: ALARM_LIMIT_SEC,
        3: ALARM_LIMIT_SEC,
        4: ALARM_LIMIT_SEC,
        5: ALARM_LIMIT_SEC,
        6: ALARM_LIMIT_SEC,
        7: ALARM_LIMIT_SEC,
        8: ALARM_LIMIT_SEC,
    },
    # Keep Rising だけ役割を合わせる。
    # DO1 はパトライト。DO4 は事務所ライト。
    # 豊島邸・板橋・龍ヶ崎の表は変えない。
    "keeprising": {
        1: ALARM_LIMIT_SEC,
        2: LIGHT_LIMIT_SEC,
        3: LIGHT_LIMIT_SEC,
        4: LIGHT_LIMIT_SEC,
        5: ALARM_LIMIT_SEC,
        6: ALARM_LIMIT_SEC,
        7: ALARM_LIMIT_SEC,
        8: ALARM_LIMIT_SEC,
    },
}

_BOARD_DO = {
    1: 17,
    2: 18,
    3: 19,
    4: 20,
    5: 21,
    6: 22,
    7: 23,
    8: 24,
}

_RESET_NAMES = (
    ("PWRON_RESET", "PWRON"),
    ("WDT_RESET", "WDT"),
    ("SOFT_RESET", "SOFT"),
    ("HARD_RESET", "HARD"),
    ("DEEPSLEEP_RESET", "DEEPSLEEP"),
)


def limit_sec(profile, channel):
    """チャネルの上限秒。ファンは None。"""
    table = _LIMITS.get(profile) or {}
    try:
        ch = int(channel)
    except Exception:
        return ALARM_LIMIT_SEC
    if ch in table:
        return table[ch]
    return ALARM_LIMIT_SEC


def _diff_ms(now_ms, started_ms):
    """ticks の周回をまたいでも経過を返す。"""
    try:
        import time

        diff = getattr(time, "ticks_diff", None)
        if diff is not None:
            return int(diff(int(now_ms), int(started_ms)))
    except Exception:
        pass
    return int(now_ms) - int(started_ms)


def reason_from_codes(cause, codes):
    """machine の定数からリセット名にする。"""
    if not isinstance(codes, dict):
        return "UNKNOWN"
    name = codes.get(cause)
    if name:
        return name
    return "UNKNOWN"


class DoGuard:
    """連続ONの経過を見て、上限で切り候補を返す。"""

    def __init__(self, profile):
        self.profile = profile
        self.since = {}
        self.pending = []
        self.held = set()

    def note(self, channel, on, now_ms):
        """ONの開始だけ記録する。再ONでは戻さない。"""
        try:
            ch = int(channel)
        except Exception:
            return
        if on:
            if ch not in self.since:
                self.since[ch] = int(now_ms)
            return
        self.since.pop(ch, None)

    def channel_on(self, channel):
        try:
            return int(channel) in self.since
        except Exception:
            return False

    def overdue(self, now_ms):
        """上限に達したチャネル。ファンは含めない。"""
        late = []
        for ch, started in list(self.since.items()):
            cap = limit_sec(self.profile, ch)
            if cap is None:
                continue
            elapsed = _diff_ms(now_ms, started)
            if elapsed >= int(cap) * 1000:
                late.append(ch)
        return late

    def mark_cut(self, channel, now_ms):
        """遮断を心拍へ載せる行にする。"""
        try:
            ch = int(channel)
        except Exception:
            return None
        self.since.pop(ch, None)
        self.held.add(ch)
        row = {
            "ch": ch,
            "limit_sec": limit_sec(self.profile, ch),
            "at_ms": int(now_ms),
        }
        self.pending.append(row)
        if len(self.pending) > 8:
            self.pending = self.pending[-8:]
        return row

    def allow(self, channel, on, now_ms):
        """
        出力してよいか。
        遮断後は一度OFFになるまで再点灯しない。
        """
        try:
            ch = int(channel)
        except Exception:
            return bool(on)
        if not on:
            self.held.discard(ch)
            self.note(ch, False, now_ms)
            return False
        if ch in self.held:
            return False
        self.note(ch, True, now_ms)
        if ch in self.overdue(now_ms):
            self.mark_cut(ch, now_ms)
            return False
        return True

    def pending_cuts(self):
        return list(self.pending)

    def clear_pending(self):
        self.pending = []


def boot_all_do_off(gpio_map=None, off_level=None, pin_ctor=None):
    """
    通信より前に DO1〜DO8 を切る。
    失敗した端子は飛ばし、起動は続ける。
    非反転の OFF は GPIO 0。
    """
    mapping = dict(_BOARD_DO)
    if isinstance(gpio_map, dict):
        for ch, gpio in gpio_map.items():
            try:
                mapping[int(ch)] = int(gpio)
            except Exception:
                pass
    if pin_ctor is None:
        try:
            from machine import Pin

            pin_ctor = Pin
        except Exception:
            return {}
    pins = {}
    for ch in sorted(mapping.keys()):
        gpio = mapping[ch]
        try:
            pin = pin_ctor(int(gpio), pin_ctor.OUT)
            level = 0
            if off_level is not None:
                level = int(off_level(ch))
            pin.value(level)
            pins[ch] = pin
        except Exception:
            pass
    return pins


def mark_ota_reset(path=None):
    """再起動の直前に .ota_reboot を残す。
    次回の起動理由は WDT ではなく OTA。
    """
    name = path or OTA_RESET_FLAG
    try:
        handle = open(name, "w")
        try:
            handle.write("OTA")
        finally:
            handle.close()
    except Exception:
        pass


def _take_ota_flag(name):
    """旗のファイルがあれば読み、すぐに消す。"""
    try:
        handle = open(name, "r")
        try:
            handle.read()
        finally:
            handle.close()
    except Exception:
        return False
    try:
        import os

        os.remove(name)
    except Exception:
        pass
    return True


def consume_ota_reset(path=None):
    """旗があれば OTA。見つかったファイルは消す。"""
    names = (path,) if path else _OTA_FLAG_NAMES
    found = False
    for name in names:
        if _take_ota_flag(name):
            found = True
    return found


def read_reset_reason(path=None, machine_mod=None):
    """起動理由。OTA の旗を WDT より先に見る。"""
    if consume_ota_reset(path):
        return "OTA"
    mod = machine_mod
    if mod is None:
        try:
            import machine as mod
        except Exception:
            return "UNKNOWN"
    try:
        cause = mod.reset_cause()
    except Exception:
        return "UNKNOWN"
    codes = {}
    for attr, label in _RESET_NAMES:
        value = getattr(mod, attr, None)
        if value is not None:
            codes[value] = label
    return reason_from_codes(cause, codes)


def uptime_sec(boot_ms, now_ms=None):
    """起動からの秒。負の周回は 0 にする。"""
    if now_ms is None:
        try:
            import time

            now_ms = time.ticks_ms()
        except Exception:
            now_ms = boot_ms
    diff = _diff_ms(now_ms, boot_ms)
    if diff < 0:
        diff = 0
    return int(diff / 1000)


def health_payload(boot_ms, reason, cuts=None, now_ms=None):
    """心拍へ足す稼働時間と起動理由。"""
    payload = {
        "uptime_sec": uptime_sec(boot_ms, now_ms),
        "reset_reason": reason or "UNKNOWN",
    }
    if cuts:
        payload["do_limit_cuts"] = cuts
    return payload

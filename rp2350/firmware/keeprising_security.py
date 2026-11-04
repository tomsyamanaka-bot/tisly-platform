"""
Keep Rising のセンサーとリレー。
夜間だけ現地で出力する。回線が切れても
判定とコイルは止めない。通知は後送り。
"""

# 版番号は直下 npm run build が揃える
FIRMWARE_LOGIC_VERSION = "1.2.54"

DI_DEBOUNCE_MS = 50
HEARTBEAT_INTERVAL_SEC = 300
WDT_TIMEOUT_MS = 8000
BLINK_MS = 500
JST_OFFSET_SEC = 9 * 60 * 60
TENANT_ID = "KEEPRISING001"
SITE_ID = "SEC-JP-KEEPRISING-001"
DEVICE_ID = "rp2350-keeprising-main-01"

DI_NAMES = {
    1: "センサー1（赤外線ビーム）",
    2: "門マグネットセンサー",
    3: "センサー2（赤外線ビーム）",
    4: "センサー3（赤外線ビーム）",
}

# 投光器4は DO7。DI4 では DO3 と束ねる
SENSOR_OUTPUTS = {
    1: (6,),
    2: (),
    3: (1, 2, 4),
    4: (1, 2, 3, 7, 4, 5),
}

FLOOD_CHANNELS = (1, 2, 3, 7)
OUTPUT_CHANNELS = (1, 2, 3, 4, 5, 6, 7)

try:
    import time
except ImportError:
    time = None


def ticks_diff(now_ms, then_ms):
    """経過ミリ秒。実機の周回差分にも合わせる。"""
    if time is not None:
        try:
            return time.ticks_diff(now_ms, then_ms)
        except Exception:
            pass
    return int(now_ms) - int(then_ms)


def utc_epoch_to_jst_minutes(utc_sec):
    """UTC epoch を日本時間の分へ直す。"""
    try:
        sec = int(utc_sec)
    except Exception:
        sec = 0
    jst_sec = sec + JST_OFFSET_SEC
    return (jst_sec // 60) % (24 * 60)


def parse_hhmm(text, fallback):
    """HH:MM を深夜からの分にする。"""
    raw = str(text or "").strip()
    parts = raw.split(":")
    if len(parts) < 2:
        return int(fallback)
    try:
        hour = int(parts[0])
        minute = int(parts[1][:2])
    except Exception:
        return int(fallback)
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return int(fallback)
    return hour * 60 + minute


def minutes_in_window(now_min, start_min, end_min):
    """日をまたぐ時間帯を含む。終了分は含めない。"""
    now_min = int(now_min) % 1440
    start_min = int(start_min) % 1440
    end_min = int(end_min) % 1440
    if start_min == end_min:
        return True
    if start_min < end_min:
        return start_min <= now_min < end_min
    return now_min >= start_min or now_min < end_min


def clamp_duration_sec(raw, fallback=30):
    """点灯秒は 5 秒から 180 秒に収める。"""
    try:
        sec = int(raw)
    except Exception:
        return int(fallback)
    if sec < 5:
        return 5
    if sec > 180:
        return 180
    return sec


def normalize_mode(raw):
    """投光器は点灯か点滅だけを受け付ける。"""
    text = str(raw or "").strip().lower()
    if text == "blink":
        return "blink"
    return "steady"


class DiDebouncer:
    """50ms 安定するまで立上りを出さない。"""

    def __init__(self, confirm_ms=DI_DEBOUNCE_MS):
        self.confirm_ms = int(confirm_ms)
        self.stable = {}
        self.candidate = {}
        self.since = {}
        self.seeded = {}

    def seed(self, channel, active, now_ms):
        """起動時の接点は通知も出力もしない。"""
        ch = int(channel)
        self.stable[ch] = bool(active)
        self.candidate[ch] = bool(active)
        self.since[ch] = int(now_ms)
        self.seeded[ch] = True

    def update(self, channel, active, now_ms):
        """安定後の新しい値。変化なしは None。"""
        ch = int(channel)
        active = bool(active)
        now_ms = int(now_ms)
        need = self.confirm_ms
        if need < 50:
            need = 50
        if not self.seeded.get(ch):
            self.seed(ch, active, now_ms)
            return None
        prev = bool(self.stable.get(ch, False))
        if active == prev:
            self.candidate[ch] = active
            self.since[ch] = now_ms
            return None
        if self.candidate.get(ch) != active:
            self.candidate[ch] = active
            self.since[ch] = now_ms
            return None
        if ticks_diff(now_ms, self.since.get(ch, now_ms)) < need:
            return None
        self.stable[ch] = active
        return active


class KeepRisingController:
    """現地ループが唯一のリレー判断をする。"""

    def __init__(self, confirm_ms=DI_DEBOUNCE_MS):
        self.debouncer = DiDebouncer(confirm_ms)
        self.inputs = {1: False, 2: False, 3: False, 4: False}
        self.hold_until = {ch: None for ch in OUTPUT_CHANNELS}
        self.force_until = {ch: None for ch in OUTPUT_CHANNELS}
        self.modes = {1: "steady", 2: "steady", 3: "steady", 7: "steady"}
        self.schedule_start = 20 * 60
        self.schedule_end = 6 * 60
        self.duration_sec = 30

    def apply_rules(self, rules):
        """決定済みの設定だけを現地ルールへ写す。"""
        if not isinstance(rules, dict):
            return
        self.schedule_start = parse_hhmm(
            rules.get("scheduleStart"), self.schedule_start
        )
        self.schedule_end = parse_hhmm(
            rules.get("scheduleEnd"), self.schedule_end
        )
        self.duration_sec = clamp_duration_sec(
            rules.get("durationSec"), self.duration_sec
        )
        modes = rules.get("floodModes")
        if not isinstance(modes, dict):
            return
        mapping = {
            "1": 1,
            "do1": 1,
            "2": 2,
            "do2": 2,
            "3": 3,
            "do3": 3,
            "7": 7,
            "do7": 7,
        }
        for key, ch in mapping.items():
            if key in modes:
                self.modes[ch] = normalize_mode(modes.get(key))

    def schedule_open(self, utc_sec):
        """時刻不明のときは連動を止めない。"""
        if utc_sec is None:
            return True
        now_min = utc_epoch_to_jst_minutes(utc_sec)
        return minutes_in_window(
            now_min, self.schedule_start, self.schedule_end
        )

    def seed_inputs(self, levels, now_ms):
        """今の接点を基準にし、起動発報を出さない。"""
        for ch in (1, 2, 3, 4):
            active = bool((levels or {}).get(ch, False))
            self.debouncer.seed(ch, active, now_ms)
            self.inputs[ch] = active

    def outputs_for(self, channel):
        """センサーに対応する出力端子の組。"""
        return tuple(SENSOR_OUTPUTS.get(int(channel), ()))

    def arm(self, channels, now_ms, force=False, duration_sec=None):
        """指定端子を点灯秒だけ保持する。"""
        sec = clamp_duration_sec(
            self.duration_sec if duration_sec is None else duration_sec,
            self.duration_sec,
        )
        until = int(now_ms) + sec * 1000
        armed = []
        for ch in channels:
            try:
                num = int(ch)
            except Exception:
                continue
            if num not in self.hold_until:
                continue
            self.hold_until[num] = until
            if force:
                self.force_until[num] = until
            armed.append(num)
        return armed

    def poll_inputs(self, levels, now_ms, utc_sec):
        """
        立上りだけをイベントにする。
        夜間は即アームし、日中は通知だけ。
        """
        events = []
        open_now = self.schedule_open(utc_sec)
        for ch in (1, 2, 3, 4):
            active = bool((levels or {}).get(ch, False))
            changed = self.debouncer.update(ch, active, now_ms)
            if changed is None:
                continue
            self.inputs[ch] = bool(changed)
            outputs = []
            if changed and open_now:
                outputs = self.arm(self.outputs_for(ch), now_ms, False)
            events.append(self.build_event(ch, bool(changed), open_now, outputs))
        return events

    def build_event(self, channel, active, schedule_open, outputs):
        """VPS へ渡す検知。出力判断は済み。"""
        ch = int(channel)
        name = DI_NAMES.get(ch, "DI{}".format(ch))
        if active:
            message = "{}が反応しました".format(name)
        else:
            message = "{}が復帰しました".format(name)
        return {
            "tenantId": TENANT_ID,
            "siteId": SITE_ID,
            "deviceId": DEVICE_ID,
            "di": ch,
            "active": bool(active),
            "message": message,
            "scheduleOpen": bool(schedule_open),
            "outputs": list(outputs),
            "linkage": "local",
        }

    def apply_day_test(self, di, now_ms, duration_sec=None):
        """時間外でも、選んだセンサーの出力を出す。"""
        try:
            ch = int(di)
        except Exception:
            return []
        if ch not in SENSOR_OUTPUTS:
            return []
        return self.arm(
            self.outputs_for(ch), now_ms, True, duration_sec
        )

    def apply_command(self, body, now_ms):
        """届いた設定と日中テストだけを反映する。"""
        if not isinstance(body, dict):
            return False
        settings = body.get("settings")
        if isinstance(settings, dict):
            self.apply_rules(settings)
        cmd = str(body.get("command") or "").strip().lower()
        if cmd != "day_test":
            return bool(settings)
        channels = body.get("channels")
        if not isinstance(channels, (list, tuple)):
            channels = self.outputs_for(body.get("di"))
        self.arm(channels, now_ms, True, body.get("durationSec"))
        return True

    def _still(self, until, now_ms):
        """保持時刻が未来なら点灯中。"""
        if until is None:
            return False
        return ticks_diff(int(until), int(now_ms)) > 0

    def physical(self, now_ms, utc_sec):
        """
        コイルへ書く真偽。点滅は 500ms。
        時間外の通常保持はここで消す。
        """
        open_now = self.schedule_open(utc_sec)
        levels = {}
        for ch in OUTPUT_CHANNELS:
            forced = self._still(self.force_until.get(ch), now_ms)
            held = self._still(self.hold_until.get(ch), now_ms)
            if held and not open_now and not forced:
                self.hold_until[ch] = None
                held = False
            if not forced:
                self.force_until[ch] = None
            on = held or forced
            if not on:
                levels[ch] = False
                continue
            if ch in FLOOD_CHANNELS and self.modes.get(ch) == "blink":
                phase = (int(now_ms) // BLINK_MS) % 2
                levels[ch] = phase == 0
            else:
                levels[ch] = True
        return levels


def build_heartbeat_payload(extra=None):
    """死活と版だけ。センサー欄は入れない。"""
    payload = {
        "tenantId": TENANT_ID,
        "siteId": SITE_ID,
        "deviceId": DEVICE_ID,
        "firmware_version": FIRMWARE_LOGIC_VERSION,
        "otaVersion": FIRMWARE_LOGIC_VERSION,
    }
    if extra and isinstance(extra, dict):
        payload.update(extra)
    for banned in (
        "inputStates",
        "input_states",
        "inputs",
        "di",
        "active",
        "message",
        "source",
        "alert",
    ):
        payload.pop(banned, None)
    return payload


def init_watchdog(timeout_ms=None):
    """物理 WDT。ホストでは None を返す。"""
    ms = int(timeout_ms if timeout_ms is not None else WDT_TIMEOUT_MS)
    try:
        import machine

        return machine.WDT(timeout=ms)
    except Exception:
        return None


def kick_watchdog(wdt):
    """WDT が無い環境では何もしない。"""
    if wdt is None:
        return
    try:
        wdt.feed()
    except Exception:
        pass

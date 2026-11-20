"""
Keep Rising のセンサーとリレー。
夜間だけ現地で出力する。回線が切れても
判定とコイルは止めない。通知は後送り。
"""

import time

# 版番号は直下 npm run build が揃える
FIRMWARE_LOGIC_VERSION = "1.2.68"

DI_DEBOUNCE_MS = 50
HEARTBEAT_INTERVAL_SEC = 300
WDT_TIMEOUT_MS = 8000
BLINK_MS = 500
JST_OFFSET_SEC = 9 * 60 * 60
TENANT_ID = "KEEPRISING001"
SITE_ID = "SEC-JP-KEEPRISING-001"
DEVICE_ID = "rp2350-keeprising-main-01"

# 確定割当。GPIO は config の番号のまま。
# DI1 ビーム1（外周・遠距離）
# DI2 ビーム2（敷地内・中間）
# DI3 ビーム3（建物至近・事務所前）
# DO1 パトライト（赤色回転灯とスピーカー）
# DO2 投光器1 / DO3 投光器2
# DO4 事務所ライト（室内ベースライト）
DI_NAMES = {
    1: "ビームセンサー1（外周・遠距離）",
    2: "ビームセンサー2（敷地内・中間）",
    3: "ビームセンサー3（建物至近・事務所前）",
    4: "未使用入力",
}

DO_PATLITE = 1
DO_FLOOD_1 = 2
DO_FLOOD_2 = 3
DO_OFFICE = 4
# 点滅させるのは投光器だけ。パトライトと
# 事務所ライトは点灯のままにする。
FLOOD_CHANNELS = (DO_FLOOD_1, DO_FLOOD_2)
# 未使用の DO5〜DO8 も毎回 OFF を書く。
OUTPUT_CHANNELS = (1, 2, 3, 4, 5, 6, 7, 8)

LINK_STAGED_STEADY = "staged_steady"
LINK_STAGED_BLINK = "staged_blink"
LINK_FULL = "full"
LINK_NOTIFY = "notify"
# 威嚇は 250ms 点灯、250ms 消灯。
# 待ちは置かず、周回の位相だけで切替える。
BLINK_MS = 250
STAGE_WINDOW_DEFAULT_SEC = 60
STAGE_WINDOW_MIN_SEC = 5
STAGE_WINDOW_MAX_SEC = 300

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


def clamp_stage_window_sec(raw, fallback=STAGE_WINDOW_DEFAULT_SEC):
    """DI2 から DI3 までの秒。5〜300 に収める。"""
    try:
        sec = int(raw)
    except Exception:
        return int(fallback)
    if sec < STAGE_WINDOW_MIN_SEC:
        return STAGE_WINDOW_MIN_SEC
    if sec > STAGE_WINDOW_MAX_SEC:
        return STAGE_WINDOW_MAX_SEC
    return sec


def normalize_beam_mode(raw):
    """段階点灯、威嚇点滅、全警戒、通知のみ。"""
    text = str(raw or "").strip().lower()
    if text in ("staged_blink", "blink", "threat", "two_stage_blink"):
        return LINK_STAGED_BLINK
    if text in ("full", "direct", "immediate"):
        return LINK_FULL
    if text in ("notify", "silent", "notify_only"):
        return LINK_NOTIFY
    return LINK_STAGED_STEADY


def normalize_guard_mode(raw):
    """away はフル連動。home は通知のみ。disarmed は停止。"""
    text = str(raw or "away").strip().lower()
    if text in ("disarmed", "off", "stop"):
        return "disarmed"
    if text in ("home", "notify", "notify_only"):
        return "notify"
    return "away"


def truthy_flag(raw):
    """昼間連動テストの ON。未設定は OFF。"""
    if raw is True or raw == 1:
        return True
    text = str(raw or "").strip().lower()
    return text in ("1", "true", "on", "yes")


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
        self.styles = {DO_FLOOD_1: "steady", DO_FLOOD_2: "steady"}
        self.schedule_start = 20 * 60
        self.schedule_end = 6 * 60
        self.duration_sec = 30
        self.guard_mode = "away"
        self.daytime_relay = False
        self.beam_mode = LINK_STAGED_STEADY
        self.stage_window_sec = STAGE_WINDOW_DEFAULT_SEC
        # DI2 が立ったミリ秒。無いときは None。
        self.di2_rise_ms = None
        # NTP 後だけ時計を使う。9時間は足さない。
        self._ntp_ready = False
        self._server_jst = None
        self._server_jst_ms = None

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
        if "guardMode" in rules:
            next_mode = normalize_guard_mode(rules.get("guardMode"))
            if next_mode != "away":
                for ch in OUTPUT_CHANNELS:
                    self.hold_until[ch] = None
            self.guard_mode = next_mode
        if "daytimeRelayTest" in rules:
            self.daytime_relay = truthy_flag(rules.get("daytimeRelayTest"))
        jst = rules.get("jstMinutes", rules.get("jst_minutes"))
        if jst is not None:
            self.note_server_jst(jst)
        mode_raw = None
        if "beamLinkMode" in rules:
            mode_raw = rules.get("beamLinkMode")
        elif "beamMode" in rules:
            mode_raw = rules.get("beamMode")
        if mode_raw is not None:
            next_mode = normalize_beam_mode(mode_raw)
            if next_mode == LINK_NOTIFY:
                for ch in OUTPUT_CHANNELS:
                    self.hold_until[ch] = None
                    self.force_until[ch] = None
            self.beam_mode = next_mode
        window = None
        if "stageWindowSec" in rules:
            window = rules.get("stageWindowSec")
        elif "di2ToDi3Sec" in rules:
            window = rules.get("di2ToDi3Sec")
        if window is not None:
            self.stage_window_sec = clamp_stage_window_sec(
                window, self.stage_window_sec
            )

    def outputs_allowed(self, open_now):
        """警戒 ON かつ通知のみ以外。昼はテスト中だけ。"""
        if getattr(self, "beam_mode", LINK_STAGED_STEADY) == LINK_NOTIFY:
            return False
        if getattr(self, "guard_mode", "away") != "away":
            return False
        if open_now:
            return True
        return bool(getattr(self, "daytime_relay", False))

    def sync_ntp(self):
        """NTP は UTC のまま。32400 は時計へ書かない。"""
        try:
            import ntptime
        except Exception:
            return False
        try:
            try:
                ntptime.timeout = 2
            except Exception:
                pass
            ntptime.settime()
            int(time.time())
        except Exception:
            return False
        self._ntp_ready = True
        return True

    def note_server_jst(self, minutes):
        """NTP 前の日本時間。基板の時計は変えない。"""
        try:
            value = int(minutes)
        except Exception:
            return
        if value < 0 or value > 1439:
            return
        self._server_jst = value
        try:
            self._server_jst_ms = time.ticks_ms()
        except Exception:
            self._server_jst_ms = 0

    def jst_minutes(self, utc_sec):
        """昼夜判定は日本時間。加算は評価のときだけ。"""
        if self._ntp_ready:
            try:
                utc_sec = int(time.time())
            except Exception:
                utc_sec = 0
            return utc_epoch_to_jst_minutes(utc_sec)
        if self._server_jst is not None:
            elapsed = 0
            try:
                elapsed = time.ticks_diff(
                    time.ticks_ms(), self._server_jst_ms
                )
            except Exception:
                elapsed = 0
            if elapsed < 0:
                elapsed = 0
            return (self._server_jst + int(elapsed / 60000)) % 1440
        if utc_sec is None:
            return None
        return utc_epoch_to_jst_minutes(utc_sec)

    def schedule_open(self, utc_sec):
        """時刻不明のときは連動を止めない。"""
        now_min = self.jst_minutes(utc_sec)
        if now_min is None:
            return True
        return minutes_in_window(
            now_min, self.schedule_start, self.schedule_end
        )

    def seed_inputs(self, levels, now_ms):
        """今の接点を基準にし、起動発報を出さない。"""
        for ch in (1, 2, 3, 4):
            active = bool((levels or {}).get(ch, False))
            self.debouncer.seed(ch, active, now_ms)
            self.inputs[ch] = active

    def _di2_fresh(self, now_ms):
        """DI2 から指定秒以内なら段階侵入。"""
        stamp = self.di2_rise_ms
        if stamp is None:
            return False
        limit = int(self.stage_window_sec) * 1000
        elapsed = ticks_diff(int(now_ms), int(stamp))
        return elapsed >= 0 and elapsed <= limit

    def plan_for(self, channel, now_ms):
        """
        立上り 1 回分の出力計画。
        要素は (端子, steady か blink)。
        DI2 の時刻はリレーの可否と別に残す。
        """
        try:
            ch = int(channel)
        except Exception:
            return []
        if ch == 2:
            self.di2_rise_ms = int(now_ms)
        mode = getattr(self, "beam_mode", LINK_STAGED_STEADY)
        if mode == LINK_NOTIFY or ch not in (1, 2, 3):
            return []
        if mode == LINK_FULL:
            return [
                (DO_PATLITE, "steady"),
                (DO_FLOOD_1, "steady"),
                (DO_FLOOD_2, "steady"),
                (DO_OFFICE, "steady"),
            ]
        flood = "blink" if mode == LINK_STAGED_BLINK else "steady"
        if ch == 1:
            return [(DO_PATLITE, "steady")]
        if ch == 2:
            return [
                (DO_PATLITE, "steady"),
                (DO_FLOOD_1, flood),
                (DO_FLOOD_2, flood),
            ]
        if self._di2_fresh(now_ms):
            return [
                (DO_PATLITE, "steady"),
                (DO_FLOOD_1, flood),
                (DO_FLOOD_2, flood),
                (DO_OFFICE, "steady"),
            ]
        # DI3 単独は投光器だけを点灯する。
        return [(DO_FLOOD_1, "steady"), (DO_FLOOD_2, "steady")]

    def arm(self, channels, now_ms, force=False, duration_sec=None):
        """計画した端子を点灯秒だけ保持する。"""
        sec = clamp_duration_sec(
            self.duration_sec if duration_sec is None else duration_sec,
            self.duration_sec,
        )
        until = int(now_ms) + sec * 1000
        armed = []
        for ch in channels:
            style = "steady"
            if isinstance(ch, (list, tuple)):
                if len(ch) < 1:
                    continue
                raw = ch[0]
                if len(ch) >= 2:
                    style = normalize_mode(ch[1])
            else:
                raw = ch
            try:
                num = int(raw)
            except Exception:
                continue
            if num not in self.hold_until:
                continue
            self.hold_until[num] = until
            if num in FLOOD_CHANNELS:
                self.styles[num] = style
            if force:
                self.force_until[num] = until
            armed.append(num)
        return armed

    def poll_inputs(self, levels, now_ms, utc_sec):
        """
        立上りだけをイベントにする。
        夜間、または昼間連動テスト中は即アームする。
        """
        events = []
        open_now = self.schedule_open(utc_sec)
        mode = getattr(self, "guard_mode", "away")
        for ch in (1, 2, 3, 4):
            active = bool((levels or {}).get(ch, False))
            changed = self.debouncer.update(ch, active, now_ms)
            if changed is None:
                continue
            self.inputs[ch] = bool(changed)
            if mode == "disarmed":
                continue
            outputs = []
            # 立上りだけ計画する。復帰で DI2 時刻は
            # 更新しない。通信を待たずにここで決める。
            if changed:
                plan = self.plan_for(ch, now_ms)
                if self.outputs_allowed(open_now):
                    outputs = self.arm(plan, now_ms, False)
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
        """時間外でも、その時点の連動計画を一度出す。"""
        try:
            ch = int(di)
        except Exception:
            return []
        if ch not in (1, 2, 3, 4):
            return []
        return self.arm(
            self.plan_for(ch, now_ms), now_ms, True, duration_sec
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
        # 出力は実機の計画を使う。回線の端子一覧は
        # 見ないので、古い配信でも端子を取り違えない。
        if body.get("di") is not None:
            self.apply_day_test(body.get("di"), now_ms, body.get("durationSec"))
            return True
        channels = body.get("channels")
        if not isinstance(channels, (list, tuple)):
            channels = []
        self.arm(channels, now_ms, True, body.get("durationSec"))
        return True

    def _still(self, until, now_ms):
        """保持時刻が未来なら点灯中。"""
        if until is None:
            return False
        return ticks_diff(int(until), int(now_ms)) > 0

    def physical(self, now_ms, utc_sec):
        """
        コイルへ書く真偽。点滅は 250ms。
        時間外の通常保持はここで消す。
        """
        open_now = self.schedule_open(utc_sec)
        allow_hold = self.outputs_allowed(open_now)
        levels = {}
        for ch in OUTPUT_CHANNELS:
            forced = self._still(self.force_until.get(ch), now_ms)
            held = self._still(self.hold_until.get(ch), now_ms)
            if held and not allow_hold and not forced:
                self.hold_until[ch] = None
                held = False
            if not forced:
                self.force_until[ch] = None
            on = held or forced
            if not on:
                levels[ch] = False
                continue
            if (
                ch in FLOOD_CHANNELS
                and self.styles.get(ch) == "blink"
            ):
                phase = (int(now_ms) // BLINK_MS) % 2
                levels[ch] = phase == 0
            else:
                levels[ch] = True
        return levels


def read_board_temperature_c():
    """内蔵温度。読めないときは None。"""
    try:
        import machine

        adc_cls = machine.ADC
        core = getattr(adc_cls, "CORE_TEMP", None)
        sensor = adc_cls(core) if core is not None else adc_cls(4)
        acc = 0
        i = 0
        while i < 4:
            acc += sensor.read_u16()
            i += 1
        reading = (acc / 4) * (3.3 / 65535)
        board_temp = round(27 - (reading - 0.706) / 0.001721, 1)
        if board_temp < -40 or board_temp > 125:
            return None
        return board_temp
    except Exception:
        return None


def build_heartbeat_payload(extra=None):
    """死活と版。温度が読めたときだけ載せる。センサー欄は入れない。"""
    payload = {
        "tenantId": TENANT_ID,
        "siteId": SITE_ID,
        "deviceId": DEVICE_ID,
        "firmware_version": FIRMWARE_LOGIC_VERSION,
        "otaVersion": FIRMWARE_LOGIC_VERSION,
        "ota_engine": "stream",
    }
    temp = read_board_temperature_c()
    if temp is not None:
        payload["board_temp"] = temp
        payload["boardTemp"] = temp
        payload["cabinetTemp"] = temp
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

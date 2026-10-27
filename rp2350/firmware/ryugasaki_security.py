"""
ウォッシュメイト龍ヶ崎店の入力と遠隔出力。

DI1 バックヤード入口MS、DI2 両替機MS、
DI3 バックヤード人感は通知専用。
検知しても DO1 回転灯と DO2 ベルは動かさない。
出力は PWA の確認後コマンドだけが変える。
付帯は 5 分心拍、内蔵温度、WDT、100ms デバウンス。
"""

# 版番号は直下 npm run build が揃える
FIRMWARE_LOGIC_VERSION = "1.2.40"

DI_DEBOUNCE_MS = 100
HEARTBEAT_INTERVAL_SEC = 300
WDT_TIMEOUT_MS = 8000
TENANT_ID = "WASHMATE001"
SITE_ID = "SEC-JP-RYUGASAKI-001"
DEVICE_ID = "rp2350-ryugasaki-main-01"

DI_NAMES = {
    1: "バックヤード入口MS",
    2: "両替機MS",
    3: "バックヤード人感センサー",
}

# 温度は監視だけ。ファンや警報リレーには使わない
BOARD_TEMP_WATCH_C = 45.0
BOARD_TEMP_CRITICAL_C = 60.0

try:
    import time
except ImportError:
    time = None


def ticks_diff(now_ms, then_ms):
    """ホストでも実機でも経過ミリ秒を返す。"""
    if time is not None:
        try:
            return time.ticks_diff(now_ms, then_ms)
        except Exception:
            pass
    return int(now_ms) - int(then_ms)


def raw_pin_is_active(value, active_low=True):
    """アクティブLowの接点を真偽へ揃える。"""
    low = int(value) == 0
    if active_low:
        return low
    return not low


class DiDebouncer:
    """100ms 安定するまで立上り・立下りを出さない。"""

    def __init__(self, confirm_ms=DI_DEBOUNCE_MS):
        self.confirm_ms = int(confirm_ms)
        self.stable = {}
        self.candidate = {}
        self.since = {}
        self.seeded = {}

    def seed(self, channel, active, now_ms):
        """起動時の初期状態は通知しない。"""
        ch = int(channel)
        self.stable[ch] = bool(active)
        self.candidate[ch] = bool(active)
        self.since[ch] = int(now_ms)
        self.seeded[ch] = True

    def update(self, channel, active, now_ms, confirm_ms=None):
        """安定後の新しい値。変化なしは None。"""
        ch = int(channel)
        active = bool(active)
        now_ms = int(now_ms)
        need = self.confirm_ms if confirm_ms is None else int(confirm_ms)
        if need < 100:
            need = 100
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


class RyugasakiController:
    """通知専用入力と、遠隔だけの出力を持つ。"""

    def __init__(self, confirm_ms=DI_DEBOUNCE_MS):
        self.debouncer = DiDebouncer(confirm_ms)
        self.inputs = {1: False, 2: False, 3: False}
        self.outputs = {1: False, 2: False}
        self.di3_confirm_ms = 1000
        self.do_seconds = {1: 15, 2: 15}
        self.hold_until = {1: None, 2: None}

    def update_timing(self, di3_confirm_ms=None, do1_sec=None, do2_sec=None):
        """顧客詳細設定を実機の待ち時間へ反映する。"""
        if di3_confirm_ms is not None:
            ms = int(di3_confirm_ms)
            if ms < 1000:
                ms = 1000
            if ms > 30000:
                ms = 30000
            self.di3_confirm_ms = ms
        if do1_sec is not None:
            self.do_seconds[1] = _clamp_duration_sec(do1_sec)
        if do2_sec is not None:
            self.do_seconds[2] = _clamp_duration_sec(do2_sec)

    def seed_inputs(self, levels, now_ms):
        """現在の接点を基準にし、起動通知を出さない。"""
        for ch in (1, 2, 3):
            active = bool(levels.get(ch, False))
            self.debouncer.seed(ch, active, now_ms)
            self.inputs[ch] = active

    def poll_inputs(self, levels, now_ms):
        """
        安定した変化だけイベントにする。
        この処理は outputs を書き換えない。
        """
        before = dict(self.outputs)
        events = []
        for ch in (1, 2, 3):
            active = bool(levels.get(ch, False))
            confirm = self.di3_confirm_ms if ch == 3 else DI_DEBOUNCE_MS
            changed = self.debouncer.update(
                ch, active, now_ms, confirm
            )
            if changed is None:
                continue
            self.inputs[ch] = bool(changed)
            events.append(self.build_event(ch, bool(changed)))
        if self.outputs != before:
            # 入力処理が出力を触ったら直ちに戻す
            self.outputs = before
        return events

    def build_event(self, channel, active):
        """VPS /event 用。出力指令フィールドは付けない。"""
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
            "source": "event",
            "linkage": "notify-only",
        }

    def apply_remote_command(self, command, channels=None, duration_sec=None, now_ms=0):
        """
        遠隔とテストだけ出力する。
        センサー名のコマンドは拒否する。
        作動は設定秒のあと自分で消す。
        """
        cmd = str(command or "").strip().lower()
        mapping = {
            "do1_on": (1, True),
            "do1_off": (1, False),
            "do1_test": (1, True),
            "do2_on": (2, True),
            "do2_off": (2, False),
            "do2_test": (2, True),
        }
        if cmd not in mapping:
            return False
        ch, on = mapping[cmd]
        if channels:
            try:
                nums = [int(x) for x in channels]
            except Exception:
                nums = []
            if nums and ch not in nums:
                return False
        self.outputs[ch] = on
        if not on:
            self.hold_until[ch] = None
            return True
        sec = self.do_seconds.get(ch, 15)
        if duration_sec is not None:
            sec = _clamp_duration_sec(duration_sec)
        self.hold_until[ch] = int(now_ms) + int(sec) * 1000
        return True

    def tick_outputs(self, now_ms):
        """設定秒を過ぎた回転灯とベルを消す。"""
        released = []
        for ch in (1, 2):
            until = self.hold_until.get(ch)
            if until is None:
                continue
            if ticks_diff(int(now_ms), int(until)) < 0:
                continue
            self.outputs[ch] = False
            self.hold_until[ch] = None
            released.append(ch)
        return released


def _clamp_duration_sec(raw):
    """動作時間は 5 秒から 180 秒。"""
    try:
        sec = int(raw)
    except Exception:
        return 15
    if sec < 5:
        return 5
    if sec > 180:
        return 180
    return sec


def build_heartbeat_payload(extra=None):
    """
    死活・温度・版だけを載せる。
    センサー発報フィールドは入れない。
    """
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
    temp = read_board_temperature_c()
    if temp is not None:
        payload["board_temp"] = temp
        payload["boardTemp"] = temp
        if temp >= BOARD_TEMP_CRITICAL_C:
            payload["overheat"] = True
    return payload


_CHIP_TEMP_ADC = None
_TEMP_CONV = 3.3 / 65535


def read_board_temperature_c():
    """
    RP2350 内蔵温度。ホスト実行では None。
    換算は 27 - (V - 0.706) / 0.001721。
    """
    global _CHIP_TEMP_ADC
    try:
        import machine

        if _CHIP_TEMP_ADC is None:
            adc_cls = machine.ADC
            core = getattr(adc_cls, "CORE_TEMP", None)
            if core is not None:
                _CHIP_TEMP_ADC = adc_cls(core)
            else:
                _CHIP_TEMP_ADC = adc_cls(4)
        acc = 0
        i = 0
        while i < 4:
            acc += _CHIP_TEMP_ADC.read_u16()
            i += 1
        reading = (acc / 4) * _TEMP_CONV
        temp = round(27 - (reading - 0.706) / 0.001721, 1)
        if temp < -40 or temp > 125:
            return None
        return temp
    except Exception:
        _CHIP_TEMP_ADC = None
        return None


def init_watchdog(timeout_ms=None):
    """
    物理 WDT。ハング時は自動再起動。
    ホストや未対応ファームでは None。
    """
    ms = int(timeout_ms if timeout_ms is not None else WDT_TIMEOUT_MS)
    try:
        import machine

        wdt = machine.WDT(timeout=ms)
        return wdt
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

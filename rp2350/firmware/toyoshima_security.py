"""
豊島邸 Security 制御 — 母屋 / はなれ

DI1/DI2 立上りエッジを 100ms デバウンスで確定し、
各リレー出力タイマーおよびパトライト点滅
（0.5 秒周期トグル）を実行する。

24 時間常時通知と夜間ライト点灯スケジュールは
独立判定（security_light.py と同様の分離）。
"""

import time

try:
    import uasyncio as asyncio
except ImportError:
    import asyncio

# デバウンス（ms）— VPS home-toyoshima-security-v1 と同期
DI_DEBOUNCE_MS = 100
# パトライト点滅周期（ms）
PATLITE_BLINK_MS = 500
# 既定出力維持（ms）
DEFAULT_OUTPUT_MS = 45_000
# 夜間スケジュール既定（JST）
DEFAULT_LIGHT_START = "18:00"
DEFAULT_LIGHT_END = "06:00"


def _parse_hm(value, fallback):
    """HH:MM を (hour, minute) に変換。"""
    raw = str(value or "").strip()
    parts = raw.split(":")
    if len(parts) != 2:
        raw = fallback
        parts = raw.split(":")
    try:
        h = int(parts[0])
        m = int(parts[1])
    except Exception:
        return 18, 0
    if h < 0 or h > 23 or m < 0 or m > 59:
        return 18, 0
    return h, m


def _hm_to_minutes(h, m):
    return h * 60 + m


class ToyoshimaBaseController:
    """DI デバウンス + スケジュール判定の共通基盤。"""

    def __init__(self, set_ch, send_event=None):
        self._set_ch = set_ch
        self._send_event = send_event
        self._di_confirm_ms = DI_DEBOUNCE_MS
        self._debounce_di1_ms = DI_DEBOUNCE_MS
        self._debounce_di2_ms = DI_DEBOUNCE_MS
        self._debounce_beam_ms = DI_DEBOUNCE_MS
        self._di_confirmed = {}
        self._confirm_gen = {}
        self._get_di = None
        self._light_start = DEFAULT_LIGHT_START
        self._light_end = DEFAULT_LIGHT_END
        self._security_paused = False
        self._guard_mode = "scheduled"
        self._output_ms = DEFAULT_OUTPUT_MS
        self._active_tasks = []

    def set_di_reader(self, get_di):
        """DI 状態 callable(di) -> 'on'|'off'。"""
        self._get_di = get_di

    def apply_rules(self, rules):
        """VPS ルール JSON を反映。"""
        if not rules or not isinstance(rules, dict):
            return False
        mode = str(rules.get("guardMode", "scheduled"))
        if mode in ("always", "night_only", "scheduled", "off"):
            self._guard_mode = mode
        self._light_start = str(
            rules.get("light_start", rules.get("scheduleStart", DEFAULT_LIGHT_START))
        )
        self._light_end = str(
            rules.get("light_end", rules.get("scheduleEnd", DEFAULT_LIGHT_END))
        )
        self._security_paused = bool(rules.get("securityPaused", False))
        ms = int(rules.get("di1DurationMs", DEFAULT_OUTPUT_MS))
        if 5000 <= ms <= 180000:
            self._output_ms = ms
        confirm = int(rules.get("diConfirmMs", DI_DEBOUNCE_MS))
        if 20 <= confirm <= 500:
            self._di_confirm_ms = confirm
        d1 = int(rules.get("debounceDi1Ms", confirm))
        if 20 <= d1 <= 500:
            self._debounce_di1_ms = d1
        else:
            self._debounce_di1_ms = self._di_confirm_ms
        d2 = int(rules.get("debounceDi2Ms", confirm))
        if 20 <= d2 <= 500:
            self._debounce_di2_ms = d2
        else:
            self._debounce_di2_ms = self._di_confirm_ms
        beam = int(rules.get("debounceBeamMs", confirm))
        if 20 <= beam <= 500:
            self._debounce_beam_ms = beam
        else:
            self._debounce_beam_ms = self._di_confirm_ms
        return True

    def log(self, msg):
        print("[toyoshima security]", msg)

    def _jst_minutes(self):
        utc_sec = int(time.time())
        jst_sec = utc_sec + 9 * 3600
        return (jst_sec // 60) % (24 * 60)

    def _is_in_light_schedule(self):
        """防犯ライト点灯時間帯（日跨ぎ対応）。"""
        sh, sm = _parse_hm(self._light_start, DEFAULT_LIGHT_START)
        eh, em = _parse_hm(self._light_end, DEFAULT_LIGHT_END)
        now = self._jst_minutes()
        start = _hm_to_minutes(sh, sm)
        end = _hm_to_minutes(eh, em)
        if start == end:
            return True
        if start < end:
            return now >= start and now < end
        return now >= start or now < end

    def _is_armed_now(self):
        """通知は 24h — OFF/一時停止以外。"""
        if self._security_paused:
            return False
        if self._guard_mode == "off":
            return False
        return True

    def _can_run_lights(self):
        """DO リレー点灯可否 — 時間帯のみ。"""
        if self._security_paused:
            return False
        if self._guard_mode == "off":
            return False
        return self._is_in_light_schedule()

    def on_di_edge(self, di, prev_state, new_state):
        """立上りで confirm_ms 待機後に確定。"""
        if new_state == "on" and prev_state != "on":
            gen = self._confirm_gen.get(di, 0) + 1
            self._confirm_gen[di] = gen
            self._di_confirmed[di] = False
            try:
                asyncio.create_task(self._confirm_rising(di, gen))
            except Exception as exc:
                self.log("confirm err: {}".format(exc))
                self._fire_di(di)
        elif new_state != "on":
            self._confirm_gen[di] = self._confirm_gen.get(di, 0) + 1
            self._di_confirmed[di] = False

    def _debounce_ms_for_di(self, di):
        """DI 番号ごとのデバウンス ms。"""
        if di == 1:
            return getattr(self, "_debounce_di1_ms", self._di_confirm_ms)
        if di == 2:
            return getattr(self, "_debounce_di2_ms", self._di_confirm_ms)
        return getattr(self, "_debounce_beam_ms", self._di_confirm_ms)

    async def _confirm_rising(self, di, gen):
        ms = self._debounce_ms_for_di(di)
        await asyncio.sleep_ms(ms)
        if self._confirm_gen.get(di) != gen:
            return
        state = "on"
        if self._get_di:
            try:
                state = self._get_di(di)
            except Exception:
                state = "off"
        if state != "on":
            self.log("DI{} chatter aborted".format(di))
            return
        if self._di_confirmed.get(di):
            return
        self._di_confirmed[di] = True
        self.log("DI{} confirmed {}ms".format(di, ms))
        self._fire_di(di)

    def _fire_di(self, di):
        raise NotImplementedError

    async def _drive_steady(self, channel, duration_ms):
        self._set_ch(channel, True)
        await asyncio.sleep_ms(duration_ms)
        self._set_ch(channel, False)

    async def _drive_blink(self, channel, duration_ms):
        """0.5 秒周期トグル点滅。"""
        end_ms = time.ticks_add(time.ticks_ms(), duration_ms)
        ch_on = False
        while True:
            if time.ticks_diff(end_ms, time.ticks_ms()) <= 0:
                break
            ch_on = not ch_on
            self._set_ch(channel, ch_on)
            await asyncio.sleep_ms(PATLITE_BLINK_MS)
        self._set_ch(channel, False)

    def _notify_vps(self, building, di, message):
        self.log(message)
        if self._send_event:
            try:
                self._send_event(building, di, message)
            except Exception as exc:
                self.log("event err: {}".format(exc))


class ToyoshimaMainHouseController(ToyoshimaBaseController):
    """
    母屋 — Waveshare RP2350 8CH Relay Board (親機)

    DI1/DI2: 遠近赤外線ビーム
    DO1/DO2: 100V 防犯ライト
    DO3: 24V パトライト
    """

    DO_LIGHT_1 = 1
    DO_LIGHT_2 = 2
    DO_PATLITE = 3
    DI_BEAM_1 = 1
    DI_BEAM_2 = 2

    def _debounce_ms_for_di(self, di):
        """母屋ビームは debounceBeamMs を使用。"""
        return getattr(self, "_debounce_beam_ms", self._di_confirm_ms)

    def _fire_di(self, di):
        if di not in (self.DI_BEAM_1, self.DI_BEAM_2):
            return
        if not self._is_armed_now():
            self.log("disarmed - main beam ignored")
            return
        self._notify_vps(
            "main",
            di,
            "母屋 遠近センサー侵入検知",
        )
        if not self._can_run_lights():
            self.log("outside schedule - lights skipped")
            return
        try:
            asyncio.create_task(self._main_beam_response())
        except Exception as exc:
            self.log("main response err: {}".format(exc))

    async def _main_beam_response(self):
        """DO1+DO2 同時点灯、設定時間後消灯。"""
        self._set_ch(self.DO_LIGHT_1, True)
        self._set_ch(self.DO_LIGHT_2, True)
        await asyncio.sleep_ms(self._output_ms)
        self._set_ch(self.DO_LIGHT_1, False)
        self._set_ch(self.DO_LIGHT_2, False)


class ToyoshimaDetachedController(ToyoshimaBaseController):
    """
    はなれ — Waveshare RP2350 6CH Relay Board (子機)

    DI1: 道路側ビーム / DI2: 通路側ビーム
    DO1: 100V ライト / DO2: 24V パトライト点滅
    """

    DO_LIGHT = 1
    DO_PATLITE = 2
    DI_ROAD = 1
    DI_PATH = 2

    def _fire_di(self, di):
        if di not in (self.DI_ROAD, self.DI_PATH):
            return
        if not self._is_armed_now():
            self.log("disarmed - detached ignored")
            return
        if di == self.DI_ROAD:
            msg = "はなれ：道路側センサー反応"
        else:
            msg = "はなれ：通路側センサー反応"
        self._notify_vps("detached", di, msg)
        try:
            asyncio.create_task(self._detached_response(di))
        except Exception as exc:
            self.log("detached response err: {}".format(exc))

    async def _detached_response(self, di):
        """DO1 点灯 + DO2 パトライト点滅。"""
        light_task = None
        blink_task = None
        if self._can_run_lights():
            light_task = asyncio.create_task(
                self._drive_steady(self.DO_LIGHT, self._output_ms)
            )
            blink_task = asyncio.create_task(
                self._drive_blink(self.DO_PATLITE, self._output_ms)
            )
        else:
            self.log("outside schedule - DO skipped (notify only)")
        tasks = [t for t in (light_task, blink_task) if t]
        if tasks:
            await asyncio.gather(*tasks)


# ── RP2350 内蔵温度センサー（ADC4） ──

def read_board_temperature_c():
    """
    RP2350 内蔵 ADC4 から盤内温度（℃）を取得。
    計算式: 27 - (voltage - 0.706) / 0.001721
    """
    try:
        import machine

        adc = machine.ADC(4)
        reading = adc.read_u16()
        voltage = reading * 3.3 / 65535
        temp_c = 27 - (voltage - 0.706) / 0.001721
        return round(temp_c, 1)
    except Exception as exc:
        print("[toyoshima security] temp read err:", exc)
        return None


def build_heartbeat_payload(building, site_id=None, device_id=None, extra=None):
    """VPS 向け heartbeat JSON（board_temp 付き）。"""
    payload = {"building": building}
    temp = read_board_temperature_c()
    if temp is not None:
        payload["board_temp"] = temp
    if site_id:
        payload["siteId"] = site_id
    if device_id:
        payload["deviceId"] = device_id
    if extra and isinstance(extra, dict):
        payload.update(extra)
    return payload


def send_toyoshima_heartbeat(http_post, building, site_id=None, device_id=None):
    """
    POST /api/home/v1/toyoshima/heartbeat
    http_post: callable(path, payload) -> (body, status)
    """
    path = "/api/home/v1/toyoshima/heartbeat"
    payload = build_heartbeat_payload(building, site_id, device_id)
    _body, status = http_post(path, payload)
    return status == 200


# 生存確認 heartbeat 間隔（秒）— VPS TOYOSHIMA_HEARTBEAT_INTERVAL_SEC_V1 と同期
HEARTBEAT_INTERVAL_SEC = 300


async def heartbeat_loop(send_heartbeat, building="main"):
    """
    RP2350 メインループから起動する 5 分周期 heartbeat。

    send_heartbeat: callable(building) -> bool
    """
    while True:
        try:
            send_heartbeat(building)
        except Exception as exc:
            print("[toyoshima security] heartbeat err:", exc)
        await asyncio.sleep(HEARTBEAT_INTERVAL_SEC)

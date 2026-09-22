"""
豊島邸 Security 制御 — 母屋 / はなれ

DI1/DI2 立上りを 100ms デバウンスで確定し、
遠近2段階のライト／フラッシュと
VPS イベント送信を行う。

24 時間常時通知。ライト点灯は 18:00〜06:00 のみ。
日中は通知のみ（ライト・フラッシュ省略）。
夜間は force_relay_test を無視してライト連動する。
日中だけ force_relay_test でテスト点灯する。

付帯: チップ内蔵温度（CORE_TEMP / ADC4） /
5分 heartbeat / 物理 WDT 8 秒
（main_toyoshima.py から利用）
"""

import time

try:
    import uasyncio as asyncio
except ImportError:
    import asyncio

# ── 豊島邸 物件識別子（VPS / 実機共通） ──
TENANT_ID = "TOYOSHIMA001"
SITE_ID = "SEC-JP-TOYOSHIMA-001"
HOME_SITE_ID = "HOME-JP-TOYOSHIMA"
API_TOYOSHIMA_BASE = "/api/home/v1/toyoshima"

# デバウンス（ms）— VPS TOYOSHIMA_DI_DEBOUNCE_MS_V1 と同期
DI_DEBOUNCE_MS = 100
# パトライト点滅周期（ms）
PATLITE_BLINK_MS = 500
# 既定出力維持（ms）
DEFAULT_OUTPUT_MS = 45_000
# フラッシュ既定維持（ms）
DEFAULT_FLASH_MS = 15_000
# 遠近モード既定（クラウド同期）
DEFAULT_SECURITY_MODE = "2STEP"
# 夜間スケジュール既定（JST）
DEFAULT_LIGHT_START = "18:00"
DEFAULT_LIGHT_END = "06:00"
# 5 分 heartbeat — VPS と同期
HEARTBEAT_INTERVAL_SEC = 300
# HTTP失敗時の再試行（最大3回）
HEARTBEAT_RETRY_MAX = 3
# 再試行の間隔（秒）
HEARTBEAT_RETRY_WAIT_SEC = 10
# 物理 WDT タイムアウト（ms）
WDT_TIMEOUT_MS = 8000
# 盤内過熱しきい値（℃）
BOARD_TEMP_OVERHEAT_C = 60.0
# 冷却ファン ON（℃）— 空き RO8
BOARD_TEMP_FAN_ON_C = 45.0
# 冷却ファン OFF（℃）— ヒステリシス
BOARD_TEMP_FAN_OFF_C = 40.0
# 冷却ファン出力（RO8 / GPIO24）
# 照明 DO1〜DO3・解錠 CH1 は使わない
FAN_CH = 8
# ロジック版（OTA カード / heartbeat が参照）
FIRMWARE_LOGIC_VERSION = "1.2.13"
# リレー CH → GPIO（Waveshare RO1〜RO8 = GPIO17〜24）
# 実際の machine.Pin 生成は main.py の BOARD_CH_GPIO。
# ここは参照用の正の写しで、ズレ検知テストが参照する。
BOARD_CH_GPIO = {1: 17, 2: 18, 3: 19, 4: 20, 5: 21, 6: 22, 7: 23, 8: 24}


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
        self._event_acked = {}
        self._get_di = None
        self._light_start = DEFAULT_LIGHT_START
        self._light_end = DEFAULT_LIGHT_END
        self._security_paused = False
        self._guard_mode = "scheduled"
        self._output_ms = DEFAULT_OUTPUT_MS
        self._flash_ms = DEFAULT_FLASH_MS
        self._flash_enabled = True
        self._force_relay_test = True
        self._security_mode = DEFAULT_SECURITY_MODE
        self._active_tasks = []
        self._manual_task = None

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
        # 遠近モード（2STEP / DIRECT / SILENT）
        mode = str(
            rules.get("security_mode", rules.get("securityMode", ""))
        ).strip().upper()
        if mode in ("2STEP", "DIRECT", "SILENT"):
            self._security_mode = mode
        # light_schedule: {"start","end"} も受け取る
        sched = rules.get("light_schedule")
        if isinstance(sched, dict):
            if sched.get("start"):
                self._light_start = str(sched.get("start"))
            if sched.get("end"):
                self._light_end = str(sched.get("end"))
        # ライト維持秒（クラウドキー）
        light_sec = rules.get("light_duration_sec")
        if light_sec is None:
            light_sec = rules.get("lighting_duration_sec")
        if light_sec is not None:
            try:
                sec = int(light_sec)
                if 5 <= sec <= 180:
                    self._output_ms = sec * 1000
            except Exception:
                pass
        # フラッシュ維持秒
        flash_sec = rules.get("flash_duration_sec")
        if flash_sec is None:
            flash_sec = rules.get("flashDurationSec")
        if flash_sec is not None:
            try:
                fsec = int(flash_sec)
                if 5 <= fsec <= 180:
                    self._flash_ms = fsec * 1000
            except Exception:
                pass
        if "flash_enabled" in rules:
            self._flash_enabled = bool(rules.get("flash_enabled"))
        elif "flashEnabled" in rules:
            self._flash_enabled = bool(rules.get("flashEnabled"))
        # テスト時は昼間でもリレーを動かす
        if "force_relay_test" in rules:
            self._force_relay_test = bool(rules.get("force_relay_test"))
        elif "forceRelayTest" in rules:
            self._force_relay_test = bool(rules.get("forceRelayTest"))
        return True

    def log(self, msg):
        line = "[豊島邸 security] {}".format(msg)
        try:
            print(line)
        except Exception:
            try:
                print(line.encode("ascii", "replace").decode("ascii"))
            except Exception:
                pass

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
        """DO ライト点灯可否。
        夜間は昼間テストを無視して点灯する。
        日中だけ force_relay_test を見る。
        """
        if self._security_paused:
            return False
        if self._guard_mode == "off":
            return False
        if self._is_in_light_schedule():
            return True
        return bool(getattr(self, "_force_relay_test", False))

    def on_di_edge(self, di, prev_state, new_state):
        """ハードデバウンス後の立上りで即時リレー。
        追加の async 確認は HTTP ブロック中に欠落するため使わない。
        """
        if new_state == "on" and prev_state != "on":
            if self._event_acked.get(di):
                self.log("DI{} already notified this hold".format(di))
                return
            gen = self._confirm_gen.get(di, 0) + 1
            self._confirm_gen[di] = gen
            self._di_confirmed[di] = True
            self.log("DI{} rising fire".format(di))
            self._fire_di(di)
        elif new_state != "on":
            self._confirm_gen[di] = self._confirm_gen.get(di, 0) + 1
            self._di_confirmed[di] = False
            self._event_acked[di] = False

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
        self.log("relay CH{} HIGH {}ms".format(channel, duration_ms))
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

    def mark_event_acked(self, di):
        """送信成功後にフラグを立て、物理OFFまで再送しない。"""
        self._event_acked[di] = True

    def clear_event_ack(self, di):
        """物理OFFで再検知を許可する。"""
        self._event_acked[di] = False

    def _invoke_send_event(self, building, di, message):
        """VPS へ /event を投げる。例外は必ず握る。"""
        if not self._send_event:
            return
        if self._event_acked.get(di):
            self.log("event skip already acked DI{}".format(di))
            return
        try:
            result = self._send_event(building, di, message)
            if result is False:
                return
            self.mark_event_acked(di)
        except Exception as exc:
            try:
                self.log("event err: {}".format(exc))
            except Exception:
                pass

    async def _notify_vps_async(self, building, di, message):
        """非同期再送。例外でメインループを殺さない。"""
        try:
            if self._event_acked.get(di):
                return
            self._invoke_send_event(building, di, message)
        except Exception as exc:
            try:
                self.log("event async err: {}".format(exc))
            except Exception:
                pass

    def _notify_vps(self, building, di, message):
        """GPIO後に必ず1回同期送信する。
        create_task は失敗時の再送だけ。タスク落ちでも送る。
        """
        try:
            self.log(message)
        except Exception:
            pass
        try:
            self._invoke_send_event(building, di, message)
        except Exception as exc:
            try:
                self.log("event sync err: {}".format(exc))
            except Exception:
                pass
        if self._event_acked.get(di):
            return
        try:
            asyncio.create_task(
                self._notify_vps_async(building, di, message)
            )
        except Exception as exc:
            try:
                self.log("event task err: {}".format(exc))
            except Exception:
                pass

    def _bulk_do_channels(self):
        """一括点灯の対象 CH。"""
        return (1,)

    def _flash_do_channel(self):
        """フラッシュ／パトライト CH。"""
        return 3

    def _cancel_manual(self):
        """直前の手動タスクを止める。"""
        task = getattr(self, "_manual_task", None)
        if not task:
            return
        try:
            task.cancel()
        except Exception:
            pass
        self._manual_task = None

    def _parse_pulse_command(self, cmd):
        """ch1_pulse_1000 形式を分解する。"""
        if "_pulse_" not in cmd:
            return None
        head, ms_s = cmd.split("_pulse_", 1)
        try:
            ms = int(ms_s)
        except Exception:
            return None
        ch_map = {
            "ch1": 1,
            "do1": 1,
            "light1": 1,
            "ch2": 2,
            "do2": 2,
            "light2": 2,
            "ch3": 3,
            "do3": 3,
            "flash": 3,
        }
        ch = ch_map.get(head)
        if ch is None:
            return None
        if ms < 100:
            ms = 100
        if ms > 180000:
            ms = 180000
        return ch, ms

    async def _hold_then_off(self, channels, duration_ms):
        """指定秒のあと対象 CH を落とす。"""
        try:
            await asyncio.sleep_ms(int(duration_ms))
            for ch in channels:
                self._set_ch(ch, False)
        except asyncio.CancelledError:
            raise

    async def execute_manual_command(self, cmd, duration_ms=0):
        """PWA 手動命令。
        昼夜・警戒を完全バイパスする。
        """
        cmd = str(cmd or "").strip().lower()
        if not cmd:
            return False
        try:
            duration_ms = int(duration_ms or 0)
        except Exception:
            duration_ms = 0
        self.log("manual cmd bypass schedule: {}".format(cmd))
        self._cancel_manual()

        pulse = self._parse_pulse_command(cmd)
        if pulse:
            ch, ms = pulse
            self._set_ch(ch, True)
            self._manual_task = asyncio.create_task(
                self._hold_then_off((ch,), ms)
            )
            return True

        on_map = {
            "do1_on": 1,
            "ch1_on": 1,
            "light1_on": 1,
            "do2_on": 2,
            "ch2_on": 2,
            "light2_on": 2,
            "do3_on": 3,
            "ch3_on": 3,
            "flash_on": 3,
        }
        off_map = {
            "do1_off": 1,
            "ch1_off": 1,
            "light1_off": 1,
            "do2_off": 2,
            "ch2_off": 2,
            "light2_off": 2,
            "do3_off": 3,
            "ch3_off": 3,
            "flash_off": 3,
        }
        if cmd in on_map:
            ch = on_map[cmd]
            self._set_ch(ch, True)
            if duration_ms > 0:
                self._manual_task = asyncio.create_task(
                    self._hold_then_off((ch,), duration_ms)
                )
            return True
        if cmd in off_map:
            self._set_ch(off_map[cmd], False)
            return True

        if cmd in ("bulk_on", "light_all_on"):
            channels = self._bulk_do_channels()
            for ch in channels:
                self._set_ch(ch, True)
            if duration_ms > 0:
                self._manual_task = asyncio.create_task(
                    self._hold_then_off(channels, duration_ms)
                )
            return True
        if cmd in ("bulk_off", "light_all_off"):
            for ch in self._bulk_do_channels():
                self._set_ch(ch, False)
            return True

        if cmd in ("flash_test", "patlite_test"):
            flash_ch = self._flash_do_channel()
            ms = duration_ms if duration_ms > 0 else int(
                getattr(self, "_flash_ms", DEFAULT_FLASH_MS)
            )
            self._set_ch(flash_ch, True)
            self._manual_task = asyncio.create_task(
                self._drive_blink(flash_ch, ms)
            )
            return True

        if cmd in ("sensor_far", "di1_alarm", "sensor_near", "di2_alarm"):
            di = 2 if cmd in ("sensor_near", "di2_alarm") else 1
            if hasattr(self, "plan_main_response"):
                plan = self.plan_main_response(di)
                self._kick_relays_now(plan)
                try:
                    asyncio.create_task(self._main_beam_response(di))
                except Exception as exc:
                    self.log("sensor cmd err: {}".format(exc))
                return True
            self._fire_di(di)
            return True

        self.log("unknown manual cmd: {}".format(cmd))
        return False


class ToyoshimaMainHouseController(ToyoshimaBaseController):
    """
    母屋 — Waveshare RP2350 8CH（主装置）

    DI1: 赤外線ビーム（遠・外周境界）
    DI2: 赤外線ビーム（近・建物アプローチ）
    DO1: 100V 防犯ライト1（主照明）
    DO2: 100V 防犯ライト2（増設投光器）
    DO3: 100V フラッシュ（ストロボ）
    """

    DO_LIGHT_1 = 1
    DO_LIGHT_2 = 2
    DO_FLASH = 3
    # 互換エイリアス（旧パトライト）
    DO_PATLITE = 3
    DI_BEAM_FAR = 1
    DI_BEAM_NEAR = 2
    DI_BEAM_1 = 1
    DI_BEAM_2 = 2

    def _bulk_do_channels(self):
        """母屋一括はライト1+2とフラッシュ。"""
        return (self.DO_LIGHT_1, self.DO_LIGHT_2, self.DO_FLASH)

    def _flash_do_channel(self):
        return self.DO_FLASH

    def _debounce_ms_for_di(self, di):
        """母屋ビームは debounceBeamMs を使用。"""
        return getattr(self, "_debounce_beam_ms", self._di_confirm_ms)

    def plan_main_response(self, di):
        """
        遠近2段階の出力計画を返す。
        ホストテストから同期で検証する。
        """
        mode = str(getattr(self, "_security_mode", "2STEP")).upper()
        silent = mode == "SILENT"
        full = (not silent) and (
            mode == "DIRECT" or di == self.DI_BEAM_NEAR
        )
        light_ok = (not silent) and self._can_run_lights()
        flash_on = (
            light_ok
            and full
            and bool(getattr(self, "_flash_enabled", True))
        )
        if di == self.DI_BEAM_FAR:
            msg = "⚠️ 外周で接近検知"
        else:
            msg = "🚨 建物至近で侵入検知！"
        return {
            "mode": mode,
            "message": msg,
            "do1": light_ok,
            "do2": light_ok and full,
            "do3": flash_on,
            "light_ms": int(getattr(self, "_output_ms", DEFAULT_OUTPUT_MS)),
            "flash_ms": int(getattr(self, "_flash_ms", DEFAULT_FLASH_MS)),
        }

    def _fire_di(self, di):
        if di not in (self.DI_BEAM_FAR, self.DI_BEAM_NEAR):
            return
        force = bool(getattr(self, "_force_relay_test", False))
        plan = self.plan_main_response(di)
        drive = self._is_armed_now() or force
        if drive and plan["mode"] != "SILENT":
            self._kick_relays_now(plan)
        # 警戒OFFでも /event は1回送る
        self._notify_vps("main", di, plan["message"])
        if not drive:
            self.log("disarmed - 母屋 通知のみ")
            return
        if plan["mode"] == "SILENT":
            self.log("SILENT — ライト/フラッシュ省略")
            return
        try:
            asyncio.create_task(self._main_beam_response(di))
        except Exception as exc:
            self.log("main response err: {}".format(exc))

    def _kick_relays_now(self, plan):
        """create_task 失敗時も即時 HIGH。"""
        if plan.get("do1"):
            self._set_ch(self.DO_LIGHT_1, True)
        if plan.get("do2"):
            self._set_ch(self.DO_LIGHT_2, True)
        if plan.get("do3"):
            self._set_ch(self.DO_FLASH, True)

    async def _main_beam_response(self, di):
        """
        2STEP: DI1=DO1 / DI2=DO1+DO2+DO3
        DIRECT: DI1/DI2 とも全開＋フラッシュ
        force_relay_test 時は昼夜無視。
        """
        plan = self.plan_main_response(di)
        self._kick_relays_now(plan)
        tasks = []
        if plan["do1"]:
            tasks.append(
                asyncio.create_task(
                    self._drive_steady(self.DO_LIGHT_1, plan["light_ms"])
                )
            )
        if plan["do2"]:
            tasks.append(
                asyncio.create_task(
                    self._drive_steady(self.DO_LIGHT_2, plan["light_ms"])
                )
            )
        if plan["do3"]:
            tasks.append(
                asyncio.create_task(
                    self._drive_blink(self.DO_FLASH, plan["flash_ms"])
                )
            )
        if not tasks:
            self.log("日中 — ライト省略（通知のみ）")
            return
        await asyncio.gather(*tasks)


class ToyoshimaDetachedController(ToyoshimaBaseController):
    """
    はなれ — Waveshare RP2350 6CH（子機）

    DI1: 道路側センサー / DI2: 通路側センサー
    DO1: ライト（夜間のみ）
    DO2: パトライト点滅（24h）
    """

    DO_LIGHT = 1
    DO_PATLITE = 2
    DI_ROAD = 1
    DI_PATH = 2

    def _bulk_do_channels(self):
        """はなれ一括はライトのみ。"""
        return (self.DO_LIGHT,)

    def _flash_do_channel(self):
        return self.DO_PATLITE

    def _fire_di(self, di):
        if di not in (self.DI_ROAD, self.DI_PATH):
            return
        force = bool(getattr(self, "_force_relay_test", False))
        drive = self._is_armed_now() or force
        if di == self.DI_ROAD:
            msg = "はなれ 道路側検知"
        else:
            msg = "はなれ 通路側検知"
        if drive:
            if self._can_run_lights():
                self._set_ch(self.DO_LIGHT, True)
            self._set_ch(self.DO_PATLITE, True)
        # 警戒OFFでも /event は1回送る
        self._notify_vps("detached", di, msg)
        if not drive:
            self.log("disarmed - はなれ 通知のみ")
            return
        try:
            asyncio.create_task(self._detached_response(di))
        except Exception as exc:
            self.log("detached response err: {}".format(exc))

    async def _detached_response(self, di):
        """
        DO2 パトライトは常時点滅。
        DO1 ライトは夜間スケジュールのみ。
        """
        light_task = None
        if self._can_run_lights():
            self._set_ch(self.DO_LIGHT, True)
            light_task = asyncio.create_task(
                self._drive_steady(self.DO_LIGHT, self._output_ms)
            )
        else:
            self.log("日中 — ライト省略（通知＋パトライトのみ）")
        blink_task = asyncio.create_task(
            self._drive_blink(self.DO_PATLITE, self._output_ms)
        )
        tasks = [blink_task]
        if light_task:
            tasks.append(light_task)
        await asyncio.gather(*tasks)


# ── RP2350 内蔵温度センサー ──
# ADC(4) は RP2350 で GPIO 誤認される
_CHIP_TEMP_ADC = None
_TEMP_CONV = 3.3 / 65535
_TEMP_SAMPLES = 4


def _open_chip_temp_adc():
    """
    チップ温度 ADC を開く。
    CORE_TEMP を優先し、無い場合は
    チャネル 4 / 8 へフォールバックする。
    """
    import machine

    adc_cls = machine.ADC
    core = getattr(adc_cls, "CORE_TEMP", None)
    if core is not None:
        try:
            return adc_cls(core)
        except Exception:
            pass
    last_err = None
    for ch in (4, 8):
        try:
            return adc_cls(ch)
        except Exception as exc:
            last_err = exc
    if last_err:
        raise last_err
    raise RuntimeError("chip temp ADC unavailable")


_FAN_SET_CH = None
_FAN_ON = False
_FAN_LAST_TICK_MS = 0
FAN_TICK_MS = 10000


def bind_fan_output(set_ch):
    """冷却ファン用 set_ch を登録する。"""
    global _FAN_SET_CH
    _FAN_SET_CH = set_ch


def resolve_fan_channel(available_chs=None):
    """空きリレーを選ぶ。CH1〜3は照明/解錠。"""
    if available_chs:
        if FAN_CH in available_chs:
            return FAN_CH
        for ch in (8, 7, 6, 5, 4):
            if ch in available_chs:
                return ch
        return None
    return FAN_CH


def apply_board_fan_control(temp, set_ch=None, fan_ch=None):
    """
    45℃以上でファンON、40℃以下でOFF。
    照明リレーとは独立して動かす。
    """
    global _FAN_ON
    fn = set_ch if set_ch is not None else _FAN_SET_CH
    ch = FAN_CH if fan_ch is None else fan_ch
    if temp is None or ch is None:
        return _FAN_ON
    try:
        t = float(temp)
    except Exception:
        return _FAN_ON
    want = _FAN_ON
    if t >= BOARD_TEMP_FAN_ON_C:
        want = True
    elif t <= BOARD_TEMP_FAN_OFF_C:
        want = False
    if want != _FAN_ON and fn:
        try:
            fn(ch, want)
        except Exception as exc:
            print("[豊島邸 security] fan relay err:", exc)
            return _FAN_ON
    _FAN_ON = want
    return _FAN_ON


def tick_board_fan_control(set_ch=None, available_chs=None):
    """10秒周期で盤内温度を見てファンを動かす。"""
    global _FAN_LAST_TICK_MS
    try:
        now = time.ticks_ms()
        if _FAN_LAST_TICK_MS and time.ticks_diff(now, _FAN_LAST_TICK_MS) < FAN_TICK_MS:
            return _FAN_ON
        _FAN_LAST_TICK_MS = now
    except Exception:
        pass
    ch = resolve_fan_channel(available_chs)
    temp = read_board_temperature_c()
    return apply_board_fan_control(temp, set_ch=set_ch, fan_ch=ch)


def read_board_temperature_c():
    """
    RP2350 内蔵温度センサー読み取り標準。
    換算: 27℃ - (reading - 0.706) / 0.001721
    """
    global _CHIP_TEMP_ADC
    try:
        if _CHIP_TEMP_ADC is None:
            _CHIP_TEMP_ADC = _open_chip_temp_adc()
        sensor_temp = _CHIP_TEMP_ADC
        conversion_factor = _TEMP_CONV
        acc = 0
        n = _TEMP_SAMPLES
        i = 0
        while i < n:
            acc += sensor_temp.read_u16()
            i += 1
        reading = (acc / n) * conversion_factor
        board_temp = round(27 - (reading - 0.706) / 0.001721, 1)
        if board_temp < -40 or board_temp > 125:
            return None
        return board_temp
    except Exception as exc:
        _CHIP_TEMP_ADC = None
        print("[豊島邸 security] temp read err:", exc)
        return None


def build_heartbeat_payload(building, site_id=None, device_id=None, extra=None):
    """VPS 向け heartbeat JSON（board_temp / 過熱フラグ）。"""
    payload = {
        "building": building,
        "tenantId": TENANT_ID,
        "siteId": site_id or SITE_ID,
    }
    if device_id:
        payload["deviceId"] = device_id
    if extra and isinstance(extra, dict):
        payload.update(extra)
    # extra の後に実測温度を必ず載せる
    temp = read_board_temperature_c()
    if temp is not None:
        payload["board_temp"] = temp
        payload["boardTemp"] = temp
        if temp >= BOARD_TEMP_OVERHEAT_C:
            payload["overheat"] = True
            payload["overheat_flag"] = True
        fan_on = apply_board_fan_control(temp)
        payload["fan_on"] = fan_on
        payload["cooling_fan"] = fan_on
    return payload


def send_toyoshima_heartbeat(http_post, building, site_id=None, device_id=None):
    """
    POST /api/home/v1/toyoshima/heartbeat
    http_post: callable(path, payload) -> (body, status)
    HTTP例外でも False を返し、呼び出し元を落とさない。
    """
    path = API_TOYOSHIMA_BASE + "/heartbeat"
    try:
        payload = build_heartbeat_payload(building, site_id, device_id)
        _body, status = http_post(path, payload)
        return status == 200
    except Exception as exc:
        print("[豊島邸 security] heartbeat http err:", exc)
        return False


def _event_status_ok(status):
    """200/202 を成功とみなす。"""
    try:
        return int(status) in (200, 202)
    except Exception:
        return False


def send_toyoshima_event(http_post, building, di, message, site_id=None, device_id=None):
    """
    POST /api/home/v1/toyoshima/event
    JSON・ソケット・メモリ例外でもメインを落とさない。
    """
    path = API_TOYOSHIMA_BASE + "/event"
    payload = {
        "building": building,
        "di": di,
        "message": message,
        "tenantId": TENANT_ID,
        "siteId": site_id or SITE_ID,
        "source": "di_edge",
        "immediate": True,
    }
    if device_id:
        payload["deviceId"] = device_id

    def _post_once(body):
        try:
            _resp, status = http_post(path, body)
            return _event_status_ok(status)
        except MemoryError as exc:
            try:
                import gc
                gc.collect()
            except Exception:
                pass
            print("[豊島邸 security] event mem err:", exc)
            return False
        except OSError as exc:
            print("[豊島邸 security] event socket err:", exc)
            return False
        except Exception as exc:
            print("[豊島邸 security] event http err:", exc)
            return False

    if _post_once(payload):
        return True
    try:
        payload["message"] = "DI{} detect".format(di)
    except Exception:
        payload["message"] = "DI detect"
    if _post_once(payload):
        return True
    tiny = {
        "building": building,
        "di": di,
        "source": "di_edge",
        "tenantId": TENANT_ID,
    }
    try:
        return _post_once(tiny)
    except Exception as exc:
        print("[豊島邸 security] event fallback err:", exc)
        return False


def _sleep_heartbeat_retry(kick_wdt=None):
    """
    再試行前に 10 秒待つ。
    WDT がある場合は 1 秒ごとにキックして
    8 秒タイムアウトでの誤リブートを防ぐ。
    """
    remaining = HEARTBEAT_RETRY_WAIT_SEC
    while remaining > 0:
        if kick_wdt:
            try:
                kick_wdt()
            except Exception:
                pass
        chunk = 1 if remaining >= 1 else remaining
        time.sleep(chunk)
        remaining -= chunk


def send_heartbeat_with_retry(send_fn, building=None, kick_wdt=None):
    """
    HTTP失敗時は 10 秒待って最大 3 回再試行。
    例外でもプロセスを落とさない。
    3 回失敗したら False を返し、
    呼び出し側は次の 5 分周期まで待つ。
    """
    last_exc = None
    for attempt in range(1, HEARTBEAT_RETRY_MAX + 1):
        try:
            if building is None:
                ok = bool(send_fn())
            else:
                ok = bool(send_fn(building))
            if ok:
                return True
        except Exception as exc:
            last_exc = exc
            print(
                "[豊島邸 security] heartbeat err try {}: {}".format(
                    attempt, exc
                )
            )
        if attempt < HEARTBEAT_RETRY_MAX:
            print(
                "[豊島邸 security] retry wait {}s ({}/{})".format(
                    HEARTBEAT_RETRY_WAIT_SEC,
                    attempt,
                    HEARTBEAT_RETRY_MAX,
                )
            )
            _sleep_heartbeat_retry(kick_wdt)
    if last_exc is not None:
        print(
            "[豊島邸 security] give up until next 5min:",
            last_exc,
        )
    else:
        print("[豊島邸 security] give up until next 5min")
    return False


async def send_heartbeat_with_retry_async(send_fn, building="main"):
    """
    async 版。失敗時は 10 秒待って最大 3 回。
    全滅しても例外は外へ出さない。
    """
    last_exc = None
    for attempt in range(1, HEARTBEAT_RETRY_MAX + 1):
        try:
            ok = bool(send_fn(building))
            if ok:
                return True
        except Exception as exc:
            last_exc = exc
            print(
                "[豊島邸 security] heartbeat err try {}: {}".format(
                    attempt, exc
                )
            )
        if attempt < HEARTBEAT_RETRY_MAX:
            print(
                "[豊島邸 security] retry wait {}s ({}/{})".format(
                    HEARTBEAT_RETRY_WAIT_SEC,
                    attempt,
                    HEARTBEAT_RETRY_MAX,
                )
            )
            await asyncio.sleep(HEARTBEAT_RETRY_WAIT_SEC)
    if last_exc is not None:
        print(
            "[豊島邸 security] give up until next 5min:",
            last_exc,
        )
    else:
        print("[豊島邸 security] give up until next 5min")
    return False


def run_boot_heartbeat_once(send_heartbeat, building="main"):
    """
    電源投入・USB 再接続直後の 0 秒 heartbeat。
    5 分待機ループに入る前に必ず呼ぶ。
    """
    try:
        print("[豊島邸 security] boot heartbeat 0sec")
        return bool(send_heartbeat(building))
    except Exception as exc:
        print("[豊島邸 security] boot heartbeat err:", exc)
        return False


async def heartbeat_loop(send_heartbeat, building="main"):
    """
    RP2350 メインループから起動する 5 分周期 heartbeat。
    起動直後 0 秒で 1 発送信し、以降は HEARTBEAT_INTERVAL_SEC。
    HTTP失敗は 10 秒×最大 3 回再試行し、
    全滅しても次の 5 分まで安全にスリープする。

    send_heartbeat: callable(building) -> bool
    """
    # 待機ループ前に即時送信（電源投入時の即時オンライン復帰）
    run_boot_heartbeat_once(send_heartbeat, building)
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL_SEC)
        try:
            await send_heartbeat_with_retry_async(
                send_heartbeat, building
            )
        except Exception as exc:
            print("[豊島邸 security] heartbeat loop err:", exc)


# ── 物理ウォッチドッグ（WDT） ──

def init_watchdog(timeout_ms=None):
    """
    8 秒タイムアウトの物理 WDT を有効化。
    ハング時は自動リブート。ホストテストでは None。
    """
    ms = int(timeout_ms if timeout_ms is not None else WDT_TIMEOUT_MS)
    try:
        import machine

        wdt = machine.WDT(timeout=ms)
        print("[豊島邸 security] WDT enabled {}ms".format(ms))
        return wdt
    except Exception as exc:
        print("[豊島邸 security] WDT unavailable:", exc)
        return None


def kick_watchdog(wdt):
    """メインループから定期キック。"""
    if wdt is None:
        return
    try:
        wdt.feed()
    except Exception as exc:
        print("[豊島邸 security] WDT feed err:", exc)

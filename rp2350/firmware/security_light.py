"""
DI赤外線センサー連動
段階的防犯ライト制御（uasyncio）

DI1=駐車場センサー / DI2=ガレージセンサー
DO CH2=外側100V (GPIO18) / DO CH3=100V投光器 (GPIO19)
サーバーから動的同期したルールで動作。
DI1/DI2 検知時は DO2+DO3 を設定時間点灯し、タイマー後に消灯する。

検知確定: 50ms 継続 ON で 1 回だけ確定
（早歩き・短いパルスでも取りこぼし防止）。
"""

import time

try:
    import uasyncio as asyncio
except ImportError:
    import asyncio

# デフォルト（サーバー未同期時）
_DEFAULT_DURATION_MS = 45_000
_DEFAULT_PERIMETER_MS = 120_000
_DEFAULT_STROBE_ON_MS = 250
_DEFAULT_STROBE_OFF_MS = 250
# DI 確定時間（短パルス検知・チャタ抑制）
_DEFAULT_DI_CONFIRM_MS = 50
# 時間指定の既定（JST 18:00〜06:00）
_DEFAULT_SCHEDULE_START = "18:00"
_DEFAULT_SCHEDULE_END = "06:00"

CH_24V = 2
CH_100V = 3
DI_OUTER = 1
DI_INNER = 2


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
        h, m = 18, 0
        fb = fallback.split(":")
        try:
            h = int(fb[0])
            m = int(fb[1])
        except Exception:
            pass
    if h < 0 or h > 23 or m < 0 or m > 59:
        return 18, 0
    return h, m


def _hm_to_minutes(h, m):
    return h * 60 + m


class SecurityLightController:
    """DI1/DI2 段階侵入に応じた防犯ライト制御。"""

    def __init__(self, set_ch, send_heartbeat=None):
        self._set_ch = set_ch
        self._send_heartbeat = send_heartbeat
        self._perimeter_until_ms = 0
        self._seq_id = 0
        self._active_task = None
        self._manual_task = None
        self._rules_version = 0
        self._guard_mode = "night_only"
        self._schedule_start = _DEFAULT_SCHEDULE_START
        self._schedule_end = _DEFAULT_SCHEDULE_END
        self._guard_active = True
        self._security_paused = False
        self._di1_duration_ms = _DEFAULT_DURATION_MS
        self._di2_duration_ms = _DEFAULT_DURATION_MS
        self._di2_standalone_ms = _DEFAULT_DURATION_MS
        self._di1_mode = "steady"
        self._di2_mode = "fast_blink"
        self._di2_100v_mode = "steady"
        self._di2_standalone_24v = "steady"
        self._di2_standalone_100v = "steady"
        self._perimeter_flag_ms = _DEFAULT_PERIMETER_MS
        self._strobe_on_ms = _DEFAULT_STROBE_ON_MS
        self._strobe_off_ms = _DEFAULT_STROBE_OFF_MS
        # di -> ON 開始 ticks / 確定済みフラグ
        self._di_confirm_ms = _DEFAULT_DI_CONFIRM_MS
        self._di_confirmed = {}
        self._confirm_gen = {}
        self._get_di = None

    def set_di_reader(self, get_di):
        """現在の DI 状態を返す callable(di) -> 'on'|'off' を登録。"""
        self._get_di = get_di

    def apply_rules(self, rules):
        """VPS から取得したルール JSON を反映。"""
        if not rules or not isinstance(rules, dict):
            return False
        ver = int(rules.get("version", 0))
        if ver <= self._rules_version and ver > 0:
            return False
        self._rules_version = ver if ver > 0 else self._rules_version + 1
        mode = str(rules.get("guardMode", "night_only"))
        if mode in ("always", "night_only", "scheduled", "off"):
            self._guard_mode = mode
        self._schedule_start = str(
            rules.get("scheduleStart", _DEFAULT_SCHEDULE_START)
        )
        self._schedule_end = str(
            rules.get("scheduleEnd", _DEFAULT_SCHEDULE_END)
        )
        self._guard_active = bool(rules.get("guardActive", True))
        self._security_paused = bool(rules.get("securityPaused", False))
        self._di1_duration_ms = int(
            rules.get("di1DurationMs", _DEFAULT_DURATION_MS)
        )
        self._di2_duration_ms = int(
            rules.get("di2AlertDurationMs", _DEFAULT_DURATION_MS)
        )
        self._di2_standalone_ms = int(
            rules.get(
                "di2StandaloneDurationMs",
                self._di2_duration_ms,
            )
        )
        self._di1_mode = str(rules.get("di1LightMode", "steady"))
        self._di2_mode = str(rules.get("di2LightMode", "fast_blink"))
        self._di2_100v_mode = str(
            rules.get("di2Light100vMode", "steady")
        )
        self._di2_standalone_24v = str(
            rules.get("di2Standalone24vMode", "steady")
        )
        self._di2_standalone_100v = str(
            rules.get("di2Standalone100vMode", "steady")
        )
        self._perimeter_flag_ms = int(
            rules.get("perimeterFlagMs", _DEFAULT_PERIMETER_MS)
        )
        self._strobe_on_ms = int(
            rules.get("strobeOnMs", _DEFAULT_STROBE_ON_MS)
        )
        self._strobe_off_ms = int(
            rules.get("strobeOffMs", _DEFAULT_STROBE_OFF_MS)
        )
        lighting_sec = int(
            rules.get(
                "lighting_duration_sec",
                rules.get("di1DurationMs", _DEFAULT_DURATION_MS) // 1000,
            )
        )
        if 5 <= lighting_sec <= 180:
            lighting_ms = lighting_sec * 1000
            self._di1_duration_ms = int(
                rules.get("di1DurationMs", lighting_ms)
            )
            self._di2_duration_ms = int(
                rules.get("di2AlertDurationMs", lighting_ms)
            )
            self._di2_standalone_ms = int(
                rules.get(
                    "di2StandaloneDurationMs",
                    self._di2_duration_ms,
                )
            )
        confirm = int(
            rules.get("diConfirmMs", self._di_confirm_ms)
        )
        # 50〜300ms を許可（早歩き検知は 50ms）
        if 50 <= confirm <= 300:
            self._di_confirm_ms = confirm
        self.log(
            "rules synced v{} mode={} window={}~{} active={} paused={} di1={}s confirm={}ms".format(
                self._rules_version,
                self._guard_mode,
                self._schedule_start,
                self._schedule_end,
                self._is_guard_active_now(),
                self._security_paused,
                self._di1_duration_ms // 1000,
                self._di_confirm_ms,
            )
        )
        return True

    def log(self, msg):
        print("[tisly security]", msg)

    def _jst_minutes(self):
        """RTC を UTC 想定し JST の分（0-1439）を返す。"""
        utc_sec = int(time.time())
        jst_sec = utc_sec + 9 * 3600
        return (jst_sec // 60) % (24 * 60)

    def _is_in_schedule_window(self):
        """開始〜終了の時間窓（日跨ぎ対応）。"""
        sh, sm = _parse_hm(self._schedule_start, _DEFAULT_SCHEDULE_START)
        eh, em = _parse_hm(self._schedule_end, _DEFAULT_SCHEDULE_END)
        now = self._jst_minutes()
        start = _hm_to_minutes(sh, sm)
        end = _hm_to_minutes(eh, em)
        if start == end:
            return True
        if start < end:
            return now >= start and now < end
        return now >= start or now < end

    def _is_guard_active_now(self):
        """ALWAYS / SCHEDULED / DISARMED を実機で評価。"""
        if self._security_paused:
            return False
        if self._guard_mode == "off":
            return False
        if self._guard_mode == "always":
            return True
        if self._guard_mode in ("night_only", "scheduled"):
            return self._is_in_schedule_window()
        return self._guard_active

    def _is_armed_now(self):
        """OFF/一時停止以外なら監視・ログは継続。"""
        if self._security_paused:
            return False
        if self._guard_mode == "off":
            return False
        return True

    def _can_run_lights(self):
        """時間指定窓内のみ DO リレー点灯を許可。"""
        if not self._is_guard_active_now():
            if self._security_paused:
                self.log("security paused — lights off")
            elif self._guard_mode == "off":
                self.log("guard off (DISARMED) — lights off")
            elif self._guard_mode in ("night_only", "scheduled"):
                self.log("outside schedule (SCHEDULED) — lights off")
            else:
                self.log("guard inactive — lights off")
            return False
        return True

    def _can_run(self):
        """互換: ライト連動可否。"""
        return self._can_run_lights()

    def on_di_edge(self, di, prev_state, new_state):
        """立上りで confirm_ms 待機後に確定。OFF でキャンセル。"""
        if di not in (DI_OUTER, DI_INNER):
            return
        if new_state == "on" and prev_state != "on":
            gen = self._confirm_gen.get(di, 0) + 1
            self._confirm_gen[di] = gen
            self._di_confirmed[di] = False
            try:
                asyncio.create_task(self._confirm_rising(di, gen))
            except Exception as exc:
                self.log("confirm task err: {}".format(exc))
                # フォールバック: 即確定
                self._fire_di(di)
        elif new_state != "on":
            self._confirm_gen[di] = self._confirm_gen.get(di, 0) + 1
            self._di_confirmed[di] = False

    async def _confirm_rising(self, di, gen):
        """confirm_ms 継続 ON なら 1 回だけパターン起動。"""
        await asyncio.sleep_ms(self._di_confirm_ms)
        if self._confirm_gen.get(di) != gen:
            return
        state = "on"
        if self._get_di:
            try:
                state = self._get_di(di)
            except Exception:
                state = "off"
        if state != "on":
            self.log("DI{} chatter — confirm aborted".format(di))
            return
        if self._di_confirmed.get(di):
            return
        self._di_confirmed[di] = True
        self.log(
            "DI{} confirmed after {}ms hold".format(di, self._di_confirm_ms)
        )
        self._fire_di(di)

    def _fire_di(self, di):
        if di == DI_OUTER:
            self._on_di1_detected()
        elif di == DI_INNER:
            self._on_di2_detected()

    def tick_di(self, di, state, start_timer=False):
        """互換スタブ（非同期確定へ移行済み）。"""
        pass

    def tick_from_states(self, input_states):
        """互換スタブ（非同期確定へ移行済み）。"""
        pass

    def _perimeter_active(self):
        return time.ticks_diff(
            self._perimeter_until_ms, time.ticks_ms()
        ) > 0

    def _set_perimeter_flag(self):
        self._perimeter_until_ms = time.ticks_add(
            time.ticks_ms(), self._perimeter_flag_ms
        )

    def _clear_perimeter_flag(self):
        self._perimeter_until_ms = 0

    def _notify_vps(self, message, pattern):
        self.log(message)
        if self._send_heartbeat:
            try:
                self._send_heartbeat()
            except Exception as exc:
                print("[tisly security] heartbeat err:", exc)

    def _on_di1_detected(self):
        self.log("DI1 detected -> Pattern A")
        if not self._is_armed_now():
            self.log("disarmed — DI1 ignored")
            return
        self._set_perimeter_flag()
        self._notify_vps("security event DI1 pattern_a", "A")
        if not self._can_run_lights():
            return
        self._start_sequence("A")

    def _on_di2_detected(self):
        if not self._is_armed_now():
            self.log("disarmed — DI2 ignored")
            return
        if self._perimeter_active():
            self.log("DI2 within perimeter -> Pattern B")
            self._notify_vps("security event DI2 pattern_b", "B")
            if not self._can_run_lights():
                return
            self._start_sequence("B")
        else:
            self.log("DI2 alone -> Pattern C")
            self._notify_vps("security event DI2 pattern_c", "C")
            if not self._can_run_lights():
                return
            self._start_sequence("C")

    def _start_sequence(self, pattern):
        self._seq_id += 1
        seq_id = self._seq_id
        if self._active_task is not None:
            try:
                self._active_task.cancel()
            except Exception:
                pass
        self._active_task = asyncio.create_task(
            self._run_sequence(pattern, seq_id)
        )

    def _all_security_off(self):
        self._set_ch(CH_24V, False)
        self._set_ch(CH_100V, False)

    async def _run_sequence(self, pattern, seq_id):
        try:
            if pattern == "A":
                await self._pattern_a(seq_id)
            elif pattern == "B":
                await self._pattern_b(seq_id)
            elif pattern == "C":
                await self._pattern_c(seq_id)
        except asyncio.CancelledError:
            self._all_security_off()
            raise
        finally:
            if self._seq_id == seq_id:
                self._active_task = None

    def _seq_alive(self, seq_id):
        return self._seq_id == seq_id

    async def _pattern_a(self, seq_id):
        """駐車場センサー (DI1): DO2 + DO3 を同時点灯。"""
        mode = self._di1_mode
        duration_ms = self._di1_duration_ms
        if mode == "off":
            self.log("Pattern A: lights OFF (config)")
            return
        # DI1 でも外側100V(DO2) と投光器(DO3) を連動点灯
        mode_100v = "steady" if mode == "strobe" else mode
        self.log(
            "Pattern A: DO2+DO3 on mode={} {}s".format(
                mode, duration_ms // 1000
            )
        )
        await self._run_dual_lights(seq_id, duration_ms, mode, mode_100v)
        if self._seq_alive(seq_id):
            self._all_security_off()

    async def _pattern_b(self, seq_id):
        duration_ms = self._di2_duration_ms
        await self._run_dual_lights(
            seq_id,
            duration_ms,
            self._di2_mode,
            self._di2_100v_mode,
        )
        if self._seq_alive(seq_id):
            self._all_security_off()
            self._clear_perimeter_flag()

    async def _pattern_c(self, seq_id):
        duration_ms = self._di2_standalone_ms
        await self._run_dual_lights(
            seq_id,
            duration_ms,
            self._di2_standalone_24v,
            self._di2_standalone_100v,
        )
        if self._seq_alive(seq_id):
            self._all_security_off()

    async def _run_dual_lights(
        self, seq_id, duration_ms, mode_24v, mode_100v
    ):
        """24V/100V を個別モードで同時駆動。"""
        if mode_24v == "off" and mode_100v == "off":
            self.log("dual lights OFF (config)")
            return
        tasks = []
        if mode_24v != "off":
            tasks.append(
                self._drive_channel(
                    seq_id, CH_24V, duration_ms, mode_24v
                )
            )
        if mode_100v != "off":
            tasks.append(
                self._drive_channel(
                    seq_id, CH_100V, duration_ms, mode_100v
                )
            )
        if tasks:
            await asyncio.gather(*tasks)

    async def _drive_channel(
        self, seq_id, channel, duration_ms, mode
    ):
        if mode == "off":
            return
        if mode in ("fast_blink", "strobe"):
            await self._strobe_channel(seq_id, channel, duration_ms)
        elif mode == "blink":
            await self._blink_channel(
                seq_id, channel, duration_ms, 500, 500
            )
        else:
            self._set_ch(channel, True)
            await self._wait_duration(seq_id, duration_ms)
            if self._seq_alive(seq_id):
                self._set_ch(channel, False)

    async def _strobe_channel(self, seq_id, channel, duration_ms):
        end_ms = time.ticks_add(time.ticks_ms(), duration_ms)
        ch_on = False
        while self._seq_alive(seq_id):
            if time.ticks_diff(end_ms, time.ticks_ms()) <= 0:
                break
            ch_on = not ch_on
            self._set_ch(channel, ch_on)
            await asyncio.sleep_ms(
                self._strobe_on_ms if ch_on else self._strobe_off_ms
            )
        if self._seq_alive(seq_id):
            self._set_ch(channel, False)

    async def _blink_channel(
        self, seq_id, channel, duration_ms, on_ms, off_ms
    ):
        end_ms = time.ticks_add(time.ticks_ms(), duration_ms)
        ch_on = False
        while self._seq_alive(seq_id):
            if time.ticks_diff(end_ms, time.ticks_ms()) <= 0:
                break
            ch_on = not ch_on
            self._set_ch(channel, ch_on)
            await asyncio.sleep_ms(on_ms if ch_on else off_ms)
        if self._seq_alive(seq_id):
            self._set_ch(channel, False)

    async def _wait_duration(self, seq_id, duration_ms=None):
        ms = duration_ms if duration_ms else self._di1_duration_ms
        end_ms = time.ticks_add(time.ticks_ms(), ms)
        while self._seq_alive(seq_id):
            if time.ticks_diff(end_ms, time.ticks_ms()) <= 0:
                break
            await asyncio.sleep_ms(100)

    def _cancel_active(self):
        """センサー序列・手動点滅を中断。"""
        self._seq_id += 1
        if self._active_task is not None:
            try:
                self._active_task.cancel()
            except Exception:
                pass
            self._active_task = None
        if self._manual_task is not None:
            try:
                self._manual_task.cancel()
            except Exception:
                pass
            self._manual_task = None

    async def execute_manual_command(self, cmd):
        """VPS 手動命令 — タイマー動作を上書き即時制御。"""
        self._cancel_active()
        self.log("manual cmd: {}".format(cmd))

        if cmd == "light_24v_on":
            self._set_ch(CH_24V, True)
        elif cmd == "light_24v_off":
            self._set_ch(CH_24V, False)
        elif cmd == "light_24v_strobe":
            self._manual_task = asyncio.create_task(
                self._manual_strobe_loop(CH_24V)
            )
        elif cmd == "light_100v_on":
            self._set_ch(CH_100V, True)
        elif cmd == "light_100v_off":
            self._set_ch(CH_100V, False)
        elif cmd == "light_all_on":
            self._set_ch(CH_24V, True)
            self._set_ch(CH_100V, True)
        elif cmd == "light_all_off":
            self._all_security_off()
        else:
            self.log("unknown manual cmd: {}".format(cmd))
            return False
        return True

    async def _manual_strobe_loop(self, channel):
        """手動威嚇 — 消灯命令まで高速点滅。"""
        seq_id = self._seq_id
        ch_on = False
        try:
            while self._seq_id == seq_id:
                ch_on = not ch_on
                self._set_ch(channel, ch_on)
                await asyncio.sleep_ms(
                    self._strobe_on_ms if ch_on else self._strobe_off_ms
                )
        except asyncio.CancelledError:
            self._set_ch(channel, False)
            raise
        finally:
            if self._seq_id == seq_id:
                self._manual_task = None

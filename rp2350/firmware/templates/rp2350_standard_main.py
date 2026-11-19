"""
新規現場の RP2350 は、このファイルを起点にする。
豊島邸 1.2.67、板橋自宅 1.6.12、
龍ヶ崎店の稼働スクリプトへは上書きしない。
config.py は物件固有のため、OTA でも触らない。
出荷時は firmware 直下へコピーし、
現場の main として使う。このパスのまま
起動しない。USB と PoE は同時に繋がない。
"""

JST_OFFSET_SEC = 32400
WDT_TIMEOUT_MS = 8000
OTA_SOCKET_TIMEOUT_SEC = 4
OTA_ENGINE = "stream"
OTA_REBOOT_FLAG = ".ota_reboot"
BOOT_WAIT_MS = 2000
BOOT_SLICE_MS = 500
DHCP_TRIES = 20
DHCP_SLICE_MS = 500
HEARTBEAT_PERIOD_MS = 300000
BLINK_MS = 500
LOCK_LIMIT_SEC = 5
ALARM_LIMIT_SEC = 180
LIGHT_LIMIT_SEC = 600
DO_COUNT = 8
# Waveshare RP2350-POE-ETH-8DI-8RO の RO1〜RO8。
DO_GPIO = {
    1: 17,
    2: 18,
    3: 19,
    4: 20,
    5: 21,
    6: 22,
    7: 23,
    8: 24,
}
# 未設定時の役割。電気錠は lock、
# 回転灯・ベル・フラッシュは alarm、
# 防犯ライトと投光器は light。
# 冷却ファンだけ fan。fan は切らない。
# 現場の割当は config.py の CHANNEL_ROLE。
DEFAULT_CHANNEL_ROLE = {
    1: "light",
    2: "light",
    3: "alarm",
    4: "alarm",
    5: "alarm",
    6: "alarm",
    7: "alarm",
    8: "alarm",
}
ROLE_LIMIT_SEC = {
    "lock": LOCK_LIMIT_SEC,
    "alarm": ALARM_LIMIT_SEC,
    "light": LIGHT_LIMIT_SEC,
    "fan": None,
}
# 予備 IP は config.py を正にする。
# ここは未設定のときの例。
FALLBACK_IP = "192.168.1.200"
FALLBACK_MASK = "255.255.255.0"
FALLBACK_GATEWAY = "192.168.1.1"
FALLBACK_DNS = "8.8.8.8"
BOOT_ORDER = (
    "outputs_off",
    "watchdog",
    "boot_wait",
    "socket_timeout",
    "dhcp",
    "heartbeat",
)


def jst_clock(time_mod):
    """UTC に 9 時間を足して読む。
    基板の時計へは書き戻さない。
    """
    return time_mod.gmtime(time_mod.time() + JST_OFFSET_SEC)


def force_outputs_off(write_do):
    """通信より前に DO1〜DO8 を 0 にする。"""
    for channel in range(1, DO_COUNT + 1):
        write_do(channel, 0)


def arm_ota_socket(socket_mod, seconds=None):
    """OTA の待ちは 4 秒。3〜5 秒の範囲。"""
    sec = OTA_SOCKET_TIMEOUT_SEC if seconds is None else int(seconds)
    if sec < 3:
        sec = 3
    if sec > 5:
        sec = 5
    socket_mod.setdefaulttimeout(sec)
    return sec


def mark_ota_reboot(write_text):
    """置換の直前に旗を書く。
    次回の起動理由は OTA になる。
    """
    write_text(OTA_REBOOT_FLAG, "1")


def reset_reason(flag_exists, machine_cause):
    """旗があれば WDT より先に OTA。"""
    if flag_exists:
        return "OTA"
    cause = str(machine_cause or "").strip()
    if not cause:
        return "UNKNOWN"
    return cause


def version_query(site, version):
    """心拍の更新確認。force は付けない。"""
    return (
        "/api/firmware/{}/version?channel=production"
        "&firmware_version={}&ota_engine={}"
    ).format(site, version, OTA_ENGINE)


def boot_wait(kick, sleep_ms, total_ms=None, slice_ms=None):
    """起動後 2 秒を 500ms に割る。
    一括の sleep では WDT を止める。
    """
    left = BOOT_WAIT_MS if total_ms is None else int(total_ms)
    step = BOOT_SLICE_MS if slice_ms is None else int(slice_ms)
    if step < 1:
        step = 1
    if step > 500:
        step = 500
    while left > 0:
        kick()
        chunk = step if left > step else left
        sleep_ms(chunk)
        left -= chunk
    kick()


def bring_up_network(try_dhcp, apply_static, kick, sleep_ms):
    """DHCP を細切れに試し、
    失敗したら予備の固定 IP へ戻す。
    """
    for _index in range(DHCP_TRIES):
        kick()
        try:
            if try_dhcp():
                return "dhcp"
        except Exception:
            pass
        sleep_ms(DHCP_SLICE_MS)
    kick()
    apply_static()
    return "static"


def heartbeat_due(last_ms, now_ms):
    """初回は 0 秒。以降は 5 分。"""
    if last_ms is None:
        return True
    return int(now_ms) - int(last_ms) >= HEARTBEAT_PERIOD_MS


def build_heartbeat(boot_ms, now_ms, reason, board_temp):
    """稼働秒、起動理由、盤内温度。"""
    diff = int(now_ms) - int(boot_ms)
    if diff < 0:
        diff = 0
    payload = {
        "uptime_sec": int(diff / 1000),
        "reset_reason": reason or "UNKNOWN",
        "board_temp": board_temp,
    }
    return payload


def celsius_from_reading(reading):
    """RP2350 内蔵温度の換算式。
    範囲外は送らない。
    """
    temp = round(27 - (float(reading) - 0.706) / 0.001721, 1)
    if temp < -40 or temp > 125:
        return None
    return temp


class OutputLimiter:
    """種類ごとの連続 ON 上限。
    ファンは None で切らない。
    """

    def __init__(self, roles=None):
        self.roles = dict(DEFAULT_CHANNEL_ROLE)
        if roles:
            for key, role in roles.items():
                self.roles[int(key)] = role
        self.since = {}
        self.held = set()

    def limit_ms(self, channel):
        role = self.roles.get(int(channel), "alarm")
        sec = ROLE_LIMIT_SEC.get(role, ALARM_LIMIT_SEC)
        if sec is None:
            return None
        return int(sec) * 1000

    def allow(self, channel, on, now_ms):
        """上限に達したら False。
        一度切ったあと、OFF まで再点灯しない。
        """
        ch = int(channel)
        if not on:
            self.since.pop(ch, None)
            self.held.discard(ch)
            return False
        if ch in self.held:
            return False
        if ch not in self.since:
            self.since[ch] = int(now_ms)
        cap = self.limit_ms(ch)
        if cap is None:
            return True
        if int(now_ms) - int(self.since[ch]) >= cap:
            self.held.add(ch)
            self.since.pop(ch, None)
            return False
        return True


class BeamWindow:
    """遠近の DO1・DO2 はスライダー秒。
    点滅の終わりは必ず 0。
    DO3 はフラッシュ秒だけで分ける。
    固定の 30 秒と固定回数は使わない。
    """

    def __init__(self):
        self.mode = "SILENT"
        self.light_ms = 5000
        self.flash_ms = 15000
        self.flash_enabled = False
        self.started = None
        self.flash_started = None
        self.shape = "off"
        self.far_open = False

    def configure(self, mode, light_sec, flash_sec=15, flash_enabled=False):
        """秒数を変えても開始時刻は残す。
        短い指定は、走っている窓を縮める。
        """
        self.mode = str(mode or "SILENT")
        self.light_ms = int(light_sec) * 1000
        self.flash_ms = int(flash_sec) * 1000
        self.flash_enabled = bool(flash_enabled)
        if self.mode == "SILENT":
            self.shape = "off"
            self.far_open = False
            self.flash_started = None

    def trigger(self, di, now_ms):
        """DI1 は遠、DI2 は近。"""
        if self.mode == "SILENT":
            self.shape = "off"
            self.started = None
            self.flash_started = None
            self.far_open = False
            return
        staged = bool(self.far_open) and int(di) == 2
        self.started = int(now_ms)
        self.shape = self._shape(int(di), staged)
        if self._wants_flash(self.shape):
            self.flash_started = int(now_ms)
        else:
            self.flash_started = None
        self.far_open = int(di) == 1

    def _shape(self, di, staged):
        if di == 1:
            if self.mode == "2STEP":
                return "far_do1"
            if self.mode == "two_stage_blink":
                return "far_blink"
            return "direct_far"
        if self.mode == "two_stage_blink" and staged:
            return "near_blink"
        if self.mode == "2STEP" and staged:
            return "near_flash"
        if self.mode == "DIRECT" and staged:
            return "direct_flash"
        return "alone"

    def _wants_flash(self, shape):
        if not self.flash_enabled:
            return False
        return shape in ("near_flash", "near_blink", "direct_flash", "direct_far")

    def _elapsed(self, now_ms):
        if self.started is None:
            return None
        return int(now_ms) - int(self.started)

    def _light_alive(self, now_ms):
        elapsed = self._elapsed(now_ms)
        if elapsed is None:
            return False
        return elapsed < self.light_ms

    def _flash_alive(self, now_ms):
        if self.flash_started is None or not self.flash_enabled:
            return False
        return int(now_ms) - int(self.flash_started) < self.flash_ms

    def _blink_level(self, now_ms):
        elapsed = self._elapsed(now_ms) or 0
        if elapsed < 0:
            elapsed = 0
        if (elapsed // BLINK_MS) % 2 == 0:
            return 1
        return 0

    def levels(self, now_ms):
        """DO1, DO2, DO3。時間到達でライトは 0。"""
        if self.mode == "SILENT" or self.shape == "off":
            return (0, 0, 0)
        light_on = self._light_alive(now_ms)
        flash_on = self._flash_alive(now_ms)
        if not light_on:
            if not flash_on:
                self.far_open = False
            return (0, 0, 1 if flash_on else 0)
        flash = 1 if flash_on else 0
        if self.shape == "far_blink":
            level = self._blink_level(now_ms)
            return (level, 0, 0)
        if self.shape == "near_blink":
            level = self._blink_level(now_ms)
            return (level, level, flash)
        if self.shape == "far_do1":
            return (1, 0, 0)
        if self.shape == "alone":
            return (1, 1, 0)
        return (1, 1, flash)

    def next_wait_ms(self, now_ms):
        """待ちは 500ms 以下。メインループへ戻す。"""
        if self.mode == "SILENT" or self.shape == "off":
            return 200
        waits = [200]
        elapsed = self._elapsed(now_ms)
        if self._light_alive(now_ms):
            remain = self.light_ms - elapsed
            waits.append(remain)
            if self.shape in ("far_blink", "near_blink"):
                into = elapsed % BLINK_MS
                waits.append(BLINK_MS - into)
        if self._flash_alive(now_ms):
            waits.append(self.flash_ms - (int(now_ms) - int(self.flash_started)))
        step = min(waits)
        if step < 1:
            step = 1
        if step > 500:
            step = 500
        return int(step)


def load_site_config():
    """無い現場では None。例外で止めない。"""
    try:
        import config
    except ImportError:
        return None
    return config


def channel_roles(config=None):
    """config.py の CHANNEL_ROLE を優先する。"""
    raw = None
    if config is not None:
        raw = getattr(config, "CHANNEL_ROLE", None)
    if not isinstance(raw, dict) or not raw:
        return dict(DEFAULT_CHANNEL_ROLE)
    roles = dict(DEFAULT_CHANNEL_ROLE)
    for key, role in raw.items():
        roles[int(key)] = role
    return roles


def fallback_static(config=None):
    """予備 IP。config.py があればそれを使う。"""
    if config is None:
        return (FALLBACK_IP, FALLBACK_MASK, FALLBACK_GATEWAY, FALLBACK_DNS)
    return (
        str(getattr(config, "STATIC_IP", FALLBACK_IP)),
        str(getattr(config, "STATIC_MASK", FALLBACK_MASK)),
        str(getattr(config, "STATIC_GATEWAY", FALLBACK_GATEWAY)),
        str(getattr(config, "STATIC_DNS", FALLBACK_DNS)),
    )


def _kick(wdt):
    if wdt is None:
        return
    try:
        wdt.feed()
    except Exception:
        pass


def _init_wdt():
    try:
        import tisly_wdt
    except ImportError:
        return None
    return tisly_wdt.init_watchdog(WDT_TIMEOUT_MS)


def _open_do_pins():
    from machine import Pin

    pins = {}
    for channel, gpio in DO_GPIO.items():
        pin = Pin(gpio, Pin.OUT)
        pin.value(0)
        pins[channel] = pin
    return pins


def _paint(kind):
    try:
        import tisly_rgb
    except ImportError:
        return
    try:
        tisly_rgb.set_status(kind)
    except Exception:
        pass


def _flag_exists():
    try:
        handle = open(OTA_REBOOT_FLAG, "r")
    except Exception:
        return False
    try:
        handle.read()
    finally:
        handle.close()
    try:
        import os

        os.remove(OTA_REBOOT_FLAG)
    except Exception:
        pass
    return True


def _machine_cause():
    try:
        import machine
    except ImportError:
        return "UNKNOWN"
    try:
        cause = machine.reset_cause()
    except Exception:
        return "UNKNOWN"
    for name in ("WDT_RESET", "PWRON_RESET", "SOFT_RESET"):
        value = getattr(machine, name, None)
        if value is not None and cause == value:
            if name == "WDT_RESET":
                return "WDT"
            if name == "PWRON_RESET":
                return "PWRON"
            return "SOFT"
    return "UNKNOWN"


def main():
    """実機の入口。ホストでは何もしない。
    通信の前に全 DO を切る。
    """
    try:
        import machine  # noqa: F401
        import time
    except ImportError:
        return
    wdt = _init_wdt()

    def kick():
        _kick(wdt)

    pins = _open_do_pins()
    force_outputs_off(lambda channel, level: pins[channel].value(level))
    boot_wait(kick, time.sleep_ms)
    try:
        import socket

        arm_ota_socket(socket, OTA_SOCKET_TIMEOUT_SEC)
    except Exception:
        pass
    _paint("boot")
    config = load_site_config()
    # ネットワーク失敗でもリレー監視は続ける。
    try:
        from ethernet_init import ethernet_init

        ethernet_init(
            static=fallback_static(config),
            kick=kick,
            timeout_sec=10,
            wait_for_ip=True,
        )
    except Exception:
        pass
    reason = reset_reason(_flag_exists(), _machine_cause())
    boot_ms = time.ticks_ms()
    last_hb = None
    limiter = OutputLimiter(channel_roles(config))
    window = BeamWindow()
    while True:
        kick()
        now = time.ticks_ms()
        if heartbeat_due(last_hb, now):
            temp = None
            body = build_heartbeat(boot_ms, now, reason, temp)
            body["ota_engine"] = OTA_ENGINE
            last_hb = now
            _paint("ok")
            try:
                import tisly_ota

                tisly_ota.maybe_update(
                    None, config, kick, False, None
                )
            except Exception:
                pass
        for channel in range(1, DO_COUNT + 1):
            if not limiter.allow(channel, pins[channel].value(), now):
                pins[channel].value(0)
        # 現場の DI はここで window.trigger(1 か 2, now)
        # を呼ぶ。秒数は configure のスライダー秒。
        levels = window.levels(now)
        for index, level in enumerate(levels):
            channel = index + 1
            allowed = limiter.allow(channel, bool(level), now)
            pins[channel].value(1 if allowed else 0)
        time.sleep_ms(window.next_wait_ms(now))


if __name__ == "__main__":
    main()

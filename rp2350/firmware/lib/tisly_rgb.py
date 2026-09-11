"""
TiSLY 出荷判定 RGB ドライバ

Waveshare RP2350-POE-ETH-8DI-8RO の
オンボード WS2812（既定 GPIO2）を制御する。
赤=未設定/異常、青=設定済・未疎通、
緑=出荷OK（点滅または呼吸）。
"""

try:
    from machine import Pin
except ImportError:
    Pin = None

try:
    import time
except ImportError:
    time = None

STATUS_UNCONFIGURED = "UNCONFIGURED"
STATUS_FAULT = "FAULT"
STATUS_CONFIGURED = "CONFIGURED"
STATUS_SHIPPABLE = "SHIPPABLE"

# 視認しやすい低輝度（夜間の検査台向け）
_RED = (48, 0, 0)
_BLUE = (0, 0, 48)
_GREEN = (0, 48, 0)
_OFF = (0, 0, 0)

_ALIASES = {
    "red": STATUS_UNCONFIGURED,
    "error": STATUS_FAULT,
    "fault": STATUS_FAULT,
    "unconfigured": STATUS_UNCONFIGURED,
    "blue": STATUS_CONFIGURED,
    "boot": STATUS_CONFIGURED,
    "configured": STATUS_CONFIGURED,
    "ok": STATUS_SHIPPABLE,
    "green": STATUS_SHIPPABLE,
    "shippable": STATUS_SHIPPABLE,
}


def normalize_status(code):
    """ステータスコードを標準4値へ揃える。"""
    raw = str(code or "").strip()
    if not raw:
        return STATUS_UNCONFIGURED
    key = raw.upper()
    if key in (
        STATUS_UNCONFIGURED,
        STATUS_FAULT,
        STATUS_CONFIGURED,
        STATUS_SHIPPABLE,
    ):
        return key
    alias = _ALIASES.get(raw.lower())
    if alias:
        return alias
    return STATUS_UNCONFIGURED


def color_for_status(code, on=True, breath=0):
    """点灯色を返す（消灯時は黒）。"""
    status = normalize_status(code)
    if not on and status != STATUS_SHIPPABLE:
        return _OFF
    if status == STATUS_SHIPPABLE:
        if not on and breath <= 0:
            return _OFF
        level = breath if breath > 0 else 48
        if level > 48:
            level = 48
        return (0, int(level), 0)
    if status in (STATUS_UNCONFIGURED, STATUS_FAULT):
        return _RED if on else _OFF
    return _BLUE if on else _OFF


class TislyRgb:
    """オンボード NeoPixel 1 灯の状態機。"""

    def __init__(self, pin_no=2, count=1):
        self.pin_no = int(pin_no)
        self.count = int(count) if int(count) > 0 else 1
        self.status = STATUS_UNCONFIGURED
        self._np = None
        self._on = True
        self._breath = 8
        self._breath_dir = 4
        self._last_ms = 0
        self._init_hw()

    def _init_hw(self):
        if Pin is None:
            return
        try:
            import neopixel

            self._np = neopixel.NeoPixel(Pin(self.pin_no), self.count)
        except Exception:
            self._np = None

    def set_status(self, status_code):
        """出荷判定色を切替えて即時反映する。"""
        self.status = normalize_status(status_code)
        self._on = True
        if self.status == STATUS_SHIPPABLE:
            self._breath = 24
            self._breath_dir = 4
        self._write(color_for_status(self.status, True, self._breath))
        return self.status

    def tick(self, now_ms=None):
        """点滅/呼吸。メインループから定期呼出。"""
        interval = 420
        if self.status == STATUS_SHIPPABLE:
            interval = 80
        current = now_ms
        if current is None and time is not None:
            try:
                current = time.ticks_ms()
            except Exception:
                current = 0
        if current is None:
            current = 0
        elapsed = current - self._last_ms
        if time is not None:
            try:
                elapsed = time.ticks_diff(current, self._last_ms)
            except Exception:
                elapsed = current - self._last_ms
        if elapsed < interval and self._last_ms:
            return self.status
        self._last_ms = current
        if self.status == STATUS_SHIPPABLE:
            self._breath += self._breath_dir
            if self._breath >= 48:
                self._breath = 48
                self._breath_dir = -4
            elif self._breath <= 6:
                self._breath = 6
                self._breath_dir = 4
            self._write(
                color_for_status(self.status, True, self._breath)
            )
            return self.status
        self._on = not self._on
        self._write(color_for_status(self.status, self._on, 0))
        return self.status

    def _write(self, rgb):
        if self._np is None:
            return
        try:
            self._np[0] = (int(rgb[0]), int(rgb[1]), int(rgb[2]))
            self._np.write()
        except Exception:
            pass


_default = None


def init_rgb(config=None, pin_no=None, count=None):
    """config.py のピン番号で RGB を初期化する。"""
    global _default
    pin = pin_no
    n = count
    if config is not None:
        if pin is None:
            pin = getattr(config, "RGB_LED_PIN", 2)
        if n is None:
            n = getattr(config, "RGB_LED_COUNT", 1)
    if pin is None:
        pin = 2
    if n is None:
        n = 1
    _default = TislyRgb(pin, n)
    return _default


def get_rgb():
    """初期化済みインスタンスを返す。"""
    global _default
    if _default is None:
        _default = TislyRgb()
    return _default


def set_status(status_code):
    """標準エントリ。未初期化なら自動生成。"""
    return get_rgb().set_status(status_code)


def tick(now_ms=None):
    """点滅更新。未初期化なら何もしない。"""
    if _default is None:
        return None
    return _default.tick(now_ms)

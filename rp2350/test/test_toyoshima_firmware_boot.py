"""豊島邸 main.py の起動時クラッシュを実機前に検出するホストテスト。

machine / urequests をスタブ化して import まで通し、
SyntaxError · NameError · 不正 GPIO · セーフモード退避を検証する。
"""

import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIRMWARE = ROOT / "firmware"
sys.path.insert(0, str(FIRMWARE))

# RP2350B の有効 GPIO（0〜47）
VALID_GPIO = set(range(0, 48))


class FakePin:
    OUT = 1
    IN = 0
    PULL_UP = 2
    PULL_DOWN = 3

    created = []

    def __init__(self, gpio, mode=None, pull=None, value=None):
        gpio_no = int(gpio)
        if gpio_no not in VALID_GPIO:
            raise ValueError("invalid pin {}".format(gpio_no))
        self.gpio = gpio_no
        self.mode = mode
        self._value = 1 if value else 0
        FakePin.created.append((gpio_no, mode))

    def value(self, val=None):
        if val is None:
            return self._value
        self._value = int(val)
        return None


class FakeWDT:
    def __init__(self, timeout=8000):
        self.timeout = timeout

    def feed(self):
        return None


class FakeADC:
    CORE_TEMP = 8

    def __init__(self, ch):
        self.ch = ch

    def read_u16(self):
        return 14000


def _install_time_shims():
    """MicroPython の ticks_* / sleep_ms を CPython へ生やす。"""
    import time as _time

    if not hasattr(_time, "ticks_ms"):
        _time.ticks_ms = lambda: int(_time.monotonic() * 1000)
        _time.ticks_add = lambda a, b: int(a) + int(b)
        _time.ticks_diff = lambda a, b: int(a) - int(b)
        _time.sleep_ms = lambda _ms: None


def _install_stubs():
    _install_time_shims()
    machine = types.ModuleType("machine")
    machine.Pin = FakePin
    machine.WDT = FakeWDT
    machine.ADC = FakeADC
    machine.SPI = lambda *a, **k: None
    machine.reset = lambda: None
    sys.modules["machine"] = machine
    sys.modules["urequests"] = types.ModuleType("urequests")
    for name in ("main_toyoshima", "toyoshima_security", "config"):
        sys.modules.pop(name, None)
    import config_toyoshima

    sys.modules["config"] = config_toyoshima


def _load_main():
    _install_stubs()
    FakePin.created = []
    import main_toyoshima as mt

    return mt


def test_main_imports_without_crash():
    """import 時に例外を出さず、セーフモードにも落ちない。"""
    mt = _load_main()
    assert mt.SAFE_MODE is False, mt.SAFE_MODE_REASON
    assert mt.SAFE_MODE_REASON == ""


def test_relay_pins_bound_to_official_gpio():
    mt = _load_main()
    assert mt.CH_GPIO_MAP[1] == 17
    assert mt.CH_GPIO_MAP[2] == 18
    assert mt.CH_GPIO_MAP[3] == 19
    for ch in (1, 2, 3):
        assert ch in mt.CH_PINS, "CH{} の Pin が未生成".format(ch)
        assert mt.CH_PINS[ch].gpio == mt.CH_GPIO_MAP[ch]
    assert mt.DI_GPIO_MAP[1] == 9
    assert mt.DI_GPIO_MAP[2] == 10
    assert 1 in mt.DI_PINS and 2 in mt.DI_PINS


def test_all_pins_are_valid_rp2350_gpio():
    mt = _load_main()
    for gpio in list(mt.CH_GPIO_MAP.values()) + list(
        mt.DI_GPIO_MAP.values()
    ):
        assert gpio in VALID_GPIO, "invalid GPIO {}".format(gpio)


def test_set_ch_output_drives_high_for_do1_do2():
    mt = _load_main()
    mt.set_ch_output(1, True)
    mt.set_ch_output(2, True)
    assert mt.CH_PINS[1].value() == 1
    assert mt.CH_PINS[2].value() == 1
    assert mt.ch_states["1"] == "on"
    assert mt.ch_states["2"] == "on"
    mt.set_ch_output(1, False)
    assert mt.CH_PINS[1].value() == 0


def test_set_ch_output_recreates_missing_pin():
    """CH の Pin が欠けても遅延生成して駆動する。"""
    mt = _load_main()
    del mt.CH_PINS[2]
    mt.set_ch_output(2, True)
    assert mt.CH_PINS[2].gpio == 18
    assert mt.CH_PINS[2].value() == 1


def test_broken_logic_module_falls_back_to_safe_mode():
    """toyoshima_security が壊れていてもセーフモードで起動する。"""
    _install_stubs()
    broken = types.ModuleType("toyoshima_security")
    sys.modules["toyoshima_security"] = broken
    sys.modules.pop("main_toyoshima", None)
    try:
        import main_toyoshima as mt

        assert mt.SAFE_MODE is True
        assert "logic" in mt.SAFE_MODE_REASON
        assert callable(mt._safe_mode_loop)
        assert callable(mt.build_heartbeat_payload)
        payload = mt.build_heartbeat_payload("main")
        assert payload["safe_mode"] is True
    finally:
        sys.modules.pop("toyoshima_security", None)
        sys.modules.pop("main_toyoshima", None)


def test_run_is_guarded_by_name_check():
    """ホストで import しても起動ループが走らない。"""
    src = (FIRMWARE / "main_toyoshima.py").read_text(encoding="utf-8")
    assert 'if __name__ in ("__main__", "main"):' in src
    assert "_safe_mode_loop(" in src
    assert "except Exception as exc:" in src


def test_every_firmware_file_compiles():
    files = sorted(FIRMWARE.glob("*.py")) + sorted(
        (FIRMWARE / "lib").glob("*.py")
    )
    assert files
    for path in files:
        compile(path.read_text(encoding="utf-8"), path.name, "exec")


if __name__ == "__main__":
    test_main_imports_without_crash()
    test_relay_pins_bound_to_official_gpio()
    test_all_pins_are_valid_rp2350_gpio()
    test_set_ch_output_drives_high_for_do1_do2()
    test_set_ch_output_recreates_missing_pin()
    test_broken_logic_module_falls_back_to_safe_mode()
    test_run_is_guarded_by_name_check()
    test_every_firmware_file_compiles()
    print("ok")

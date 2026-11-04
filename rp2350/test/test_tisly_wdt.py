"""標準 WDT。ホストでは実機リセットせず、給餌と構文だけ確かめる。"""

import compileall
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
FW = ROOT / "firmware"
sys.path.insert(0, str(FW / "lib"))

import tisly_wdt  # noqa: E402


class _FakeWdt:
    def __init__(self):
        self.feeds = 0

    def feed(self):
        self.feeds += 1


def test_host_init_is_safe():
    assert tisly_wdt.WDT_TIMEOUT_MS == 8000
    assert tisly_wdt.init_watchdog(8000) is None
    tisly_wdt.kick_watchdog(None)
    tisly_wdt.arm_socket_timeout(1)


def test_kick_once_per_call():
    wdt = _FakeWdt()
    tisly_wdt.kick_watchdog(wdt)
    assert wdt.feeds == 1


def test_timeout_is_capped():
    assert tisly_wdt.init_watchdog(99999) is None


def test_main_loop_feeds_watchdog():
    text = (FW / "main.py").read_text(encoding="utf-8")
    assert "init_watchdog" in text
    assert "_kick_wdt()" in text
    assert "await _fed_sleep" in text
    assert "machine import WDT" in text or "from machine import WDT" in text
    assert "kick_wdt=_kick_wdt" in text


def test_sources_compile():
    ok = compileall.compile_file(str(FW / "lib" / "tisly_wdt.py"), quiet=1)
    assert ok
    ok_main = compileall.compile_file(str(FW / "main.py"), quiet=1)
    assert ok_main


if __name__ == "__main__":
    test_host_init_is_safe()
    test_kick_once_per_call()
    test_timeout_is_capped()
    test_main_loop_feeds_watchdog()
    test_sources_compile()
    print("tisly_wdt ok")

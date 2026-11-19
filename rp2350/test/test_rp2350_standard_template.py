"""新規現場テンプレートの秒数と安全順。"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "firmware" / "templates"
sys.path.insert(0, str(ROOT))

import rp2350_standard_main as std  # noqa: E402


class Clock:
    def __init__(self, seconds):
        self.seconds = seconds
        self.writes = []

    def time(self):
        return self.seconds

    def gmtime(self, stamp):
        self.writes.append(stamp)
        return stamp

    def localtime(self, stamp=None):
        raise AssertionError("localtime without offset")


def test_jst_adds_nine_hours_once():
    clock = Clock(1_700_000_000)
    seen = std.jst_clock(clock)
    assert seen == 1_700_000_000 + 32400
    assert clock.writes == [1_700_000_000 + 32400]


def test_boot_cuts_every_output_first():
    assert std.BOOT_ORDER[0] == "outputs_off"
    written = {}
    std.force_outputs_off(lambda channel, level: written.__setitem__(channel, level))
    assert written == {ch: 0 for ch in range(1, 9)}


def test_limits_by_role():
    guard = std.OutputLimiter(
        {1: "lock", 2: "alarm", 3: "light", 8: "fan"}
    )
    assert guard.allow(1, True, 0) is True
    assert guard.allow(1, True, 4999) is True
    assert guard.allow(1, True, 5000) is False
    assert guard.allow(1, True, 5001) is False
    assert guard.allow(1, False, 5002) is False
    assert guard.allow(1, True, 5003) is True
    alarm = std.OutputLimiter({4: "alarm"})
    assert alarm.allow(4, True, 0) is True
    assert alarm.allow(4, True, 179_999) is True
    assert alarm.allow(4, True, 180_000) is False
    light = std.OutputLimiter({2: "light"})
    assert light.allow(2, True, 0) is True
    assert light.allow(2, True, 599_999) is True
    assert light.allow(2, True, 600_000) is False
    fan = std.OutputLimiter({8: "fan"})
    assert fan.allow(8, True, 0) is True
    assert fan.allow(8, True, 9_999_999) is True


def _run_beam(mode, sec, di, far_first=False):
    window = std.BeamWindow()
    window.configure(mode, sec, flash_sec=15, flash_enabled=True)
    if far_first:
        window.trigger(1, 0)
        window.trigger(2, 0)
    else:
        window.trigger(di, 0)
    end = sec * 1000
    at_end = window.levels(end)
    before = window.levels(end - 1)
    return before, at_end, window


def test_slider_seconds_end_lights_off():
    for sec in (5, 30):
        for mode in ("2STEP", "two_stage_blink", "DIRECT"):
            for di, staged in ((1, False), (2, False), (2, True)):
                _before, at_end, window = _run_beam(
                    mode, sec, di, far_first=staged
                )
                assert at_end[0] == 0, (mode, sec, di, staged)
                assert at_end[1] == 0, (mode, sec, di, staged)
                early = window.levels(0)
                if mode == "2STEP" and di == 1 and not staged:
                    assert early == (1, 0, 0)
                elif mode == "two_stage_blink" and di == 1 and not staged:
                    assert early == (1, 0, 0)
                elif mode == "two_stage_blink" and staged:
                    assert early[0] == 1 and early[1] == 1
                else:
                    assert early[0] == 1 and early[1] == 1
                assert 1 <= window.next_wait_ms(0) <= 500
                assert 1 <= window.next_wait_ms(sec * 1000 - 10) <= 500


def test_blink_period_and_forced_off():
    window = std.BeamWindow()
    window.configure("two_stage_blink", 5, flash_sec=15, flash_enabled=True)
    window.trigger(1, 0)
    window.trigger(2, 0)
    assert window.levels(0)[0] == 1
    assert window.levels(0)[1] == 1
    assert window.levels(500)[0] == 0
    assert window.levels(500)[1] == 0
    assert window.levels(1000)[0] == 1
    assert window.levels(5000) == (0, 0, 1)
    assert window.levels(15000) == (0, 0, 0)
    assert window.next_wait_ms(0) <= 500
    assert window.next_wait_ms(450) <= 50


def test_flash_is_not_the_light_timer():
    window = std.BeamWindow()
    window.configure("2STEP", 5, flash_sec=15, flash_enabled=True)
    window.trigger(1, 0)
    window.trigger(2, 0)
    assert window.levels(4999)[2] == 1
    assert window.levels(5000)[:2] == (0, 0)
    assert window.levels(5000)[2] == 1
    assert window.levels(14999)[2] == 1
    assert window.levels(15000)[2] == 0
    long_light = std.BeamWindow()
    long_light.configure("DIRECT", 30, flash_sec=15, flash_enabled=True)
    long_light.trigger(1, 0)
    assert long_light.levels(15000)[2] == 0
    assert long_light.levels(15000)[:2] == (1, 1)
    assert long_light.levels(30000)[:2] == (0, 0)


def test_silent_never_drives():
    window = std.BeamWindow()
    window.configure("SILENT", 5, flash_sec=15, flash_enabled=True)
    window.trigger(1, 0)
    window.trigger(2, 0)
    assert window.levels(0) == (0, 0, 0)
    assert window.levels(1000) == (0, 0, 0)


def test_shorter_slider_cuts_a_running_window():
    window = std.BeamWindow()
    window.configure("two_stage_blink", 30, flash_enabled=True)
    window.trigger(2, 0)
    window.configure("two_stage_blink", 5, flash_sec=15, flash_enabled=True)
    assert window.levels(4999)[0] == 1 or window.levels(4999)[0] == 0
    assert window.levels(5000)[:2] == (0, 0)


def test_ota_flag_and_query():
    files = {}
    std.mark_ota_reboot(lambda name, text: files.__setitem__(name, text))
    assert files[".ota_reboot"] == "1"
    assert std.reset_reason(True, "WDT") == "OTA"
    assert std.reset_reason(False, "WDT") == "WDT"
    query = std.version_query("new-site", "1.0.0")
    assert "ota_engine=stream" in query
    assert "force" not in query
    sock = type("Sock", (), {})()
    seen = {}

    def setdefaulttimeout(sec):
        seen["sec"] = sec

    sock.setdefaulttimeout = setdefaulttimeout
    assert std.arm_ota_socket(sock) == 4
    assert seen["sec"] == 4


def test_boot_wait_and_dhcp_kick():
    sleeps = []
    kicks = []
    std.boot_wait(lambda: kicks.append("k"), lambda ms: sleeps.append(ms))
    assert sleeps == [500, 500, 500, 500]
    assert kicks
    calls = {"dhcp": 0, "static": 0, "kick": 0}

    def try_dhcp():
        calls["dhcp"] += 1
        return calls["dhcp"] >= 3

    def apply_static():
        calls["static"] += 1

    kind = std.bring_up_network(
        try_dhcp,
        apply_static,
        lambda: calls.__setitem__("kick", calls["kick"] + 1),
        lambda _ms: None,
    )
    assert kind == "dhcp"
    assert calls["static"] == 0
    assert calls["kick"] >= 3
    calls = {"static": 0}

    kind = std.bring_up_network(
        lambda: False,
        lambda: calls.__setitem__("static", 1),
        lambda: None,
        lambda _ms: None,
    )
    assert kind == "static"
    assert calls["static"] == 1


def test_heartbeat_starts_at_zero_then_five_minutes():
    assert std.heartbeat_due(None, 0) is True
    assert std.heartbeat_due(0, 299_999) is False
    assert std.heartbeat_due(0, 300_000) is True
    body = std.build_heartbeat(0, 300_000, "OTA", 36.2)
    assert body["uptime_sec"] == 300
    assert body["reset_reason"] == "OTA"
    assert body["board_temp"] == 36.2
    assert std.celsius_from_reading(0.706) == 27.0


def test_host_main_does_not_touch_outputs():
    std.main()


if __name__ == "__main__":
    test_jst_adds_nine_hours_once()
    test_boot_cuts_every_output_first()
    test_limits_by_role()
    test_slider_seconds_end_lights_off()
    test_blink_period_and_forced_off()
    test_flash_is_not_the_light_timer()
    test_silent_never_drives()
    test_shorter_slider_cuts_a_running_window()
    test_ota_flag_and_query()
    test_boot_wait_and_dhcp_kick()
    test_heartbeat_starts_at_zero_then_five_minutes()
    test_host_main_does_not_touch_outputs()
    print("rp2350 standard template ok")

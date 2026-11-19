"""起動時全OFF、DO上限、心拍フィールド。"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware" / "lib"))

import tisly_do_guard as guard


class _Pin:
    OUT = 1
    made = []

    def __init__(self, number, mode):
        self.number = number
        self.mode = mode
        self.level = None
        _Pin.made.append(self)

    def value(self, level=None):
        if level is None:
            return self.level
        self.level = level


def test_boot_forces_every_do_off():
    _Pin.made = []
    pins = guard.boot_all_do_off(pin_ctor=_Pin)
    assert set(pins.keys()) == {1, 2, 3, 4, 5, 6, 7, 8}
    assert all(pin.level == 0 for pin in _Pin.made)
    assert [pin.number for pin in _Pin.made] == [
        17, 18, 19, 20, 21, 22, 23, 24
    ]


def test_channel_limits_match_each_site():
    assert guard.limit_sec("itabashi", 1) == 5
    assert guard.limit_sec("itabashi", 2) == 600
    assert guard.limit_sec("itabashi", 3) == 600
    assert guard.limit_sec("itabashi", 8) is None
    assert guard.limit_sec("toyoshima", 1) == 600
    assert guard.limit_sec("toyoshima", 3) == 180
    assert guard.limit_sec("ryugasaki", 1) == 180
    assert guard.limit_sec("ryugasaki", 2) == 180
    assert guard.limit_sec("keeprising", 1) == 600
    assert guard.limit_sec("keeprising", 4) == 180
    assert guard.limit_sec("keeprising", 6) == 180


def test_lock_cuts_at_five_seconds_and_fan_stays():
    box = guard.DoGuard("itabashi")
    box.note(1, True, 0)
    box.note(8, True, 0)
    assert box.overdue(4999) == []
    assert box.overdue(5000) == [1]
    row = box.mark_cut(1, 5000)
    assert row["limit_sec"] == 5
    assert box.overdue(999999) == []


def test_light_and_alarm_use_their_own_caps():
    house = guard.DoGuard("toyoshima")
    house.note(1, True, 0)
    house.note(3, True, 0)
    assert house.overdue(179999) == []
    assert house.overdue(180000) == [3]
    assert 1 not in house.overdue(599999)
    assert house.overdue(600000) == [1, 3]


def test_repeat_on_does_not_extend_the_timer():
    box = guard.DoGuard("ryugasaki")
    box.note(2, True, 1000)
    box.note(2, True, 20000)
    assert box.overdue(1000 + 180000) == [2]


def test_cut_holds_until_the_request_drops():
    box = guard.DoGuard("itabashi")
    assert box.allow(1, True, 0) is True
    assert box.allow(1, True, 5000) is False
    assert box.allow(1, True, 6000) is False
    assert box.allow(1, False, 7000) is False
    assert box.allow(1, True, 8000) is True


def test_off_clears_the_timer():
    box = guard.DoGuard("toyoshima")
    box.note(2, True, 0)
    box.note(2, False, 1000)
    box.note(2, True, 2000)
    assert box.overdue(2000 + 599999) == []
    assert box.overdue(2000 + 600000) == [2]


def test_health_payload_and_reset_names():
    payload = guard.health_payload(1000, "WDT", now_ms=61000)
    assert payload["uptime_sec"] == 60
    assert payload["reset_reason"] == "WDT"
    assert "do_limit_cuts" not in payload
    codes = {1: "PWRON", 2: "WDT", 3: "SOFT", 4: "HARD"}
    assert guard.reason_from_codes(2, codes) == "WDT"
    assert guard.reason_from_codes(9, codes) == "UNKNOWN"


def test_ota_flag_wins_over_soft_reset(tmp_path=None):
    folder = Path(__file__).resolve().parent / "_ota_flag_tmp"
    folder.mkdir(exist_ok=True)
    flag = folder / "ota.flag"
    guard.mark_ota_reset(str(flag))

    class Machine:
        def reset_cause(self):
            return 3

        SOFT_RESET = 3

    assert guard.read_reset_reason(str(flag), Machine()) == "OTA"
    assert guard.read_reset_reason(str(flag), Machine()) == "SOFT"
    flag.unlink(missing_ok=True)


def test_ota_reboot_file_beats_wdt_and_is_removed():
    folder = Path(__file__).resolve().parent / "_ota_flag_tmp"
    folder.mkdir(exist_ok=True)
    flag = folder / ".ota_reboot"
    guard.mark_ota_reset(str(flag))
    assert flag.is_file()
    assert flag.read_text(encoding="utf-8") == "OTA"

    class Machine:
        def reset_cause(self):
            return 2

        WDT_RESET = 2

    assert guard.read_reset_reason(str(flag), Machine()) == "OTA"
    assert not flag.exists()
    assert guard.read_reset_reason(str(flag), Machine()) == "WDT"
    assert guard.OTA_RESET_FLAG == ".ota_reboot"
    assert ".ota_reboot" in guard._OTA_FLAG_NAMES
    assert "tisly_ota_reset.flag" in guard._OTA_FLAG_NAMES
    legacy = folder / "tisly_ota_reset.flag"
    legacy.write_text("OTA", encoding="utf-8")
    assert guard.read_reset_reason(str(legacy), Machine()) == "OTA"
    assert not legacy.exists()


def test_firmware_sources_call_the_guard():
    firmware = ROOT / "firmware"
    main = (firmware / "main.py").read_text(encoding="utf-8")
    house = (firmware / "main_toyoshima.py").read_text(encoding="utf-8")
    shop = (firmware / "main_ryugasaki.py").read_text(encoding="utf-8")
    keep = (firmware / "main_keeprising.py").read_text(encoding="utf-8")
    ota = (firmware / "lib" / "tisly_ota.py").read_text(encoding="utf-8")
    for src in (main, house, shop, keep):
        assert "boot_all_do_off" in src
        assert "health_payload" in src or "uptime_sec" in src
        assert "health_payload" in src or "reset_reason" in src
    assert "mark_ota_reset" in ota
    assert ".ota_reboot" in ota
    reset_at = ota.find("def _reset")
    reset_body = ota[reset_at:ota.find("\ndef ", reset_at + 1)]
    assert reset_body.find("_mark_ota_reboot") < reset_body.find(
        "machine.reset"
    )
    assert 'FIRMWARE_LOGIC_VERSION = "1.6.12"' in (
        firmware / "security_light.py"
    ).read_text(encoding="utf-8")


if __name__ == "__main__":
    test_boot_forces_every_do_off()
    test_channel_limits_match_each_site()
    test_lock_cuts_at_five_seconds_and_fan_stays()
    test_light_and_alarm_use_their_own_caps()
    test_repeat_on_does_not_extend_the_timer()
    test_cut_holds_until_the_request_drops()
    test_off_clears_the_timer()
    test_health_payload_and_reset_names()
    test_ota_flag_wins_over_soft_reset()
    test_ota_reboot_file_beats_wdt_and_is_removed()
    test_firmware_sources_call_the_guard()
    print("ok")

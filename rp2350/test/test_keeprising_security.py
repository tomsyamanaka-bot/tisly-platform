"""Keep Rising: 夜間連動と、回線なしでも出力すること。"""

import datetime
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware"))

import keeprising_security as kr


def _utc(hour, minute):
    """日本時間の時分を UTC epoch にする。"""
    jst = datetime.timezone(datetime.timedelta(hours=9))
    moment = datetime.datetime(2026, 1, 2, hour, minute, tzinfo=jst)
    return int(moment.timestamp())


def _night():
    return _utc(21, 0)


def _day():
    return _utc(12, 0)


def test_window_crosses_midnight():
    assert kr.minutes_in_window(20 * 60, 20 * 60, 6 * 60) is True
    assert kr.minutes_in_window(5 * 60 + 59, 20 * 60, 6 * 60) is True
    assert kr.minutes_in_window(6 * 60, 20 * 60, 6 * 60) is False
    assert kr.minutes_in_window(12 * 60, 20 * 60, 6 * 60) is False
    assert kr.utc_epoch_to_jst_minutes(_night()) == 21 * 60
    assert kr.utc_epoch_to_jst_minutes(_day()) == 12 * 60


def test_each_sensor_arms_only_its_outputs_at_night():
    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({1: False, 2: False, 3: False, 4: False}, 0)
    ctrl.poll_inputs({1: True}, 0, _night())
    events = ctrl.poll_inputs({1: True}, 50, _night())
    assert events[0]["outputs"] == [6]
    assert ctrl.physical(50, _night())[6] is True
    assert ctrl.physical(50, _night())[1] is False

    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({1: False, 2: False, 3: False, 4: False}, 0)
    ctrl.poll_inputs({2: True}, 0, _night())
    events = ctrl.poll_inputs({2: True}, 50, _night())
    assert events[0]["outputs"] == []
    assert ctrl.physical(50, _night()) == {ch: False for ch in kr.OUTPUT_CHANNELS}

    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({1: False, 2: False, 3: False, 4: False}, 0)
    ctrl.poll_inputs({3: True}, 0, _night())
    events = ctrl.poll_inputs({3: True}, 50, _night())
    assert events[0]["outputs"] == [1, 2, 4]
    levels = ctrl.physical(50, _night())
    assert levels[1] is True and levels[2] is True and levels[4] is True
    assert levels[3] is False and levels[5] is False

    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({1: False, 2: False, 3: False, 4: False}, 0)
    ctrl.poll_inputs({4: True}, 0, _night())
    events = ctrl.poll_inputs({4: True}, 50, _night())
    assert events[0]["outputs"] == [1, 2, 3, 7, 4, 5]
    levels = ctrl.physical(50, _night())
    for ch in (1, 2, 3, 7, 4, 5):
        assert levels[ch] is True
    assert levels[6] is False


def test_daytime_notifies_without_outputs():
    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({1: False, 2: False, 3: False, 4: False}, 0)
    ctrl.poll_inputs({4: True}, 0, _day())
    events = ctrl.poll_inputs({4: True}, 50, _day())
    assert events[0]["outputs"] == []
    assert events[0]["scheduleOpen"] is False
    assert ctrl.physical(50, _day())[1] is False
    assert ctrl.physical(50, _day())[4] is False


def test_unknown_clock_still_links():
    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({4: False}, 0)
    ctrl.poll_inputs({4: True}, 0, None)
    events = ctrl.poll_inputs({4: True}, 50, None)
    assert events[0]["outputs"] == [1, 2, 3, 7, 4, 5]


def test_day_test_forces_outputs():
    ctrl = kr.KeepRisingController()
    armed = ctrl.apply_day_test(3, 1000, 10)
    assert armed == [1, 2, 4]
    assert ctrl.physical(1000, _day())[1] is True
    assert ctrl.physical(1000, _day())[4] is True
    assert ctrl.physical(11000, _day())[1] is False


def test_blink_mode_and_confirm_rules():
    ctrl = kr.KeepRisingController()
    ctrl.apply_rules(
        {
            "scheduleStart": "20:00",
            "scheduleEnd": "06:00",
            "durationSec": 30,
            "floodModes": {"do1": "blink", "do2": "steady"},
        }
    )
    ctrl.arm([1, 2], 0, True, 30)
    assert ctrl.physical(0, _day())[1] is True
    assert ctrl.physical(500, _day())[1] is False
    assert ctrl.physical(500, _day())[2] is True
    assert ctrl.physical(30000, _day())[2] is False


def test_lights_drop_when_the_window_ends():
    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({1: False}, 0)
    ctrl.poll_inputs({1: True}, 0, _night())
    ctrl.poll_inputs({1: True}, 50, _night())
    assert ctrl.physical(50, _night())[6] is True
    assert ctrl.physical(50, _day())[6] is False


def test_main_keeps_relays_ahead_of_network():
    text = (ROOT / "firmware" / "main_keeprising.py").read_text(encoding="utf-8")
    body = text.split("def _service_once", 1)[1]
    assert body.index("poll_and_drive") < body.index("http_json(")
    assert "machine.reset" not in text
    assert "force=True" not in text
    assert "event retry" in text
    assert "keeprising_rules.json" in text
    cfg = (ROOT / "firmware" / "config_keeprising.py").read_text(encoding="utf-8")
    assert 'SCHEDULE_START = "20:00"' in cfg
    assert 'STATIC_IP = "192.168.1.210"' in cfg
    assert kr.TENANT_ID == "KEEPRISING001"
    assert kr.DI_DEBOUNCE_MS == 50


if __name__ == "__main__":
    test_window_crosses_midnight()
    test_each_sensor_arms_only_its_outputs_at_night()
    test_daytime_notifies_without_outputs()
    test_unknown_clock_still_links()
    test_day_test_forces_outputs()
    test_blink_mode_and_confirm_rules()
    test_lights_drop_when_the_window_ends()
    test_main_keeps_relays_ahead_of_network()
    print("ok")

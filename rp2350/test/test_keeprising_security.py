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


def _rise(ctrl, levels, now, utc):
    """50ms 安定した立上りだけを返す。"""
    ctrl.poll_inputs(levels, now, utc)
    return ctrl.poll_inputs(levels, now + 50, utc)


def test_staged_steady_follows_each_beam():
    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({1: False, 2: False, 3: False, 4: False}, 0)
    events = _rise(ctrl, {1: True}, 0, _night())
    assert events[0]["outputs"] == [1]
    assert ctrl.physical(50, _night())[1] is True
    assert ctrl.physical(50, _night())[2] is False
    assert ctrl.physical(50, _night())[4] is False

    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({1: False, 2: False, 3: False, 4: False}, 0)
    events = _rise(ctrl, {2: True}, 0, _night())
    assert events[0]["outputs"] == [1, 2, 3]
    levels = ctrl.physical(50, _night())
    assert levels[1] is True and levels[2] is True and levels[3] is True
    assert levels[4] is False

    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({1: False, 2: False, 3: False, 4: False}, 0)
    events = _rise(ctrl, {3: True}, 0, _night())
    assert events[0]["outputs"] == [2, 3]
    levels = ctrl.physical(50, _night())
    assert levels[2] is True and levels[3] is True
    assert levels[1] is False and levels[4] is False

    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({1: False, 2: False, 3: False, 4: False}, 0)
    events = _rise(ctrl, {4: True}, 0, _night())
    assert events[0]["outputs"] == []
    assert ctrl.physical(50, _night())[1] is False


def test_di2_then_di3_within_window_adds_office_light():
    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({2: False, 3: False}, 0)
    _rise(ctrl, {2: True}, 0, _night())
    events = _rise(ctrl, {2: True, 3: True}, 1000, _night())
    assert events[0]["di"] == 3
    assert events[0]["outputs"] == [1, 2, 3, 4]
    assert ctrl.physical(1050, _night())[4] is True


def test_di3_after_the_window_is_floods_only():
    ctrl = kr.KeepRisingController()
    ctrl.apply_rules({"stageWindowSec": 10, "durationSec": 5})
    ctrl.seed_inputs({2: False, 3: False}, 0)
    _rise(ctrl, {2: True}, 0, _night())
    events = _rise(ctrl, {2: True, 3: True}, 10100, _night())
    assert events[0]["outputs"] == [2, 3]
    levels = ctrl.physical(10150, _night())
    assert levels[2] is True and levels[3] is True
    assert levels[1] is False and levels[4] is False


def test_same_poll_counts_di3_as_staged():
    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({2: False, 3: False}, 0)
    events = _rise(ctrl, {2: True, 3: True}, 0, _night())
    by_di = {row["di"]: row["outputs"] for row in events}
    assert by_di[2] == [1, 2, 3]
    assert by_di[3] == [1, 2, 3, 4]


def test_full_mode_arms_every_output():
    ctrl = kr.KeepRisingController()
    ctrl.apply_rules({"beamLinkMode": "full"})
    ctrl.seed_inputs({1: False, 3: False}, 0)
    events = _rise(ctrl, {1: True}, 0, _night())
    assert events[0]["outputs"] == [1, 2, 3, 4]
    ctrl = kr.KeepRisingController()
    ctrl.apply_rules({"beamLinkMode": "full"})
    ctrl.seed_inputs({3: False}, 0)
    events = _rise(ctrl, {3: True}, 0, _night())
    assert events[0]["outputs"] == [1, 2, 3, 4]


def test_notify_mode_never_drives_relays():
    ctrl = kr.KeepRisingController()
    ctrl.apply_rules({"beamLinkMode": "notify", "daytimeRelayTest": True})
    ctrl.seed_inputs({2: False}, 0)
    events = _rise(ctrl, {2: True}, 0, _night())
    assert events[0]["outputs"] == []
    assert ctrl.physical(50, _night()) == {ch: False for ch in kr.OUTPUT_CHANNELS}
    assert ctrl.physical(50, _day())[2] is False


def test_daytime_notifies_without_outputs():
    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({1: False, 2: False, 3: False, 4: False}, 0)
    events = _rise(ctrl, {2: True}, 0, _day())
    assert events[0]["outputs"] == []
    assert events[0]["scheduleOpen"] is False
    assert ctrl.physical(50, _day())[1] is False
    assert ctrl.physical(50, _day())[2] is False


def test_daytime_relay_test_arms_outside_the_window():
    ctrl = kr.KeepRisingController()
    ctrl.apply_rules({"daytimeRelayTest": True})
    ctrl.seed_inputs({1: False, 4: False}, 0)
    ctrl.poll_inputs({1: True}, 0, _day())
    events = ctrl.poll_inputs({1: True}, 50, _day())
    assert events[0]["outputs"] == [1]
    assert ctrl.physical(50, _day())[1] is True
    assert ctrl.physical(50, _day())[4] is False
    ctrl.apply_rules({"daytimeRelayTest": False})
    assert ctrl.physical(50, _day())[1] is False


def test_unknown_clock_still_links():
    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({2: False}, 0)
    events = _rise(ctrl, {2: True}, 0, None)
    assert events[0]["outputs"] == [1, 2, 3]


def test_day_test_forces_outputs():
    ctrl = kr.KeepRisingController()
    armed = ctrl.apply_day_test(3, 1000, 10)
    assert armed == [2, 3]
    assert ctrl.physical(1000, _day())[2] is True
    assert ctrl.physical(1000, _day())[1] is False
    assert ctrl.physical(1000, _day())[4] is False
    assert ctrl.physical(11000, _day())[2] is False


def test_blink_mode_and_confirm_rules():
    ctrl = kr.KeepRisingController()
    ctrl.apply_rules(
        {
            "scheduleStart": "20:00",
            "scheduleEnd": "06:00",
            "durationSec": 30,
            "beamLinkMode": "staged_blink",
        }
    )
    ctrl.seed_inputs({2: False, 3: False}, 0)
    events = _rise(ctrl, {2: True}, 0, _night())
    assert events[0]["outputs"] == [1, 2, 3]
    assert ctrl.physical(50, _night())[1] is True
    assert ctrl.physical(50, _night())[2] is True
    assert ctrl.physical(50 + 250, _night())[2] is False
    assert ctrl.physical(50 + 250, _night())[1] is True
    assert ctrl.physical(50 + 250, _night())[3] is False
    alone = kr.KeepRisingController()
    alone.apply_rules({"beamLinkMode": "staged_blink"})
    alone.seed_inputs({3: False}, 0)
    _rise(alone, {3: True}, 0, _night())
    assert alone.physical(50, _night())[2] is True
    assert alone.physical(50 + 250, _night())[2] is True
    assert alone.physical(50, _night())[1] is False
    staged = kr.KeepRisingController()
    staged.apply_rules({"beamLinkMode": "staged_blink", "durationSec": 30})
    staged.seed_inputs({2: False, 3: False}, 0)
    _rise(staged, {2: True}, 0, _night())
    _rise(staged, {2: True, 3: True}, 1000, _night())
    assert staged.physical(1050 + 250, _night())[2] is False
    assert staged.physical(1050 + 250, _night())[4] is True
    assert staged.physical(1050 + 30000, _night())[2] is False


def test_lights_drop_when_the_window_ends():
    ctrl = kr.KeepRisingController()
    ctrl.seed_inputs({1: False}, 0)
    ctrl.poll_inputs({1: True}, 0, _night())
    ctrl.poll_inputs({1: True}, 50, _night())
    assert ctrl.physical(50, _night())[1] is True
    assert ctrl.physical(50, _day())[1] is False


def test_notify_and_off_skip_outputs():
    ctrl = kr.KeepRisingController()
    ctrl.apply_rules({"guardMode": "home"})
    ctrl.seed_inputs({1: False, 4: False}, 0)
    ctrl.poll_inputs({1: True}, 0, _night())
    events = ctrl.poll_inputs({1: True}, 50, _night())
    assert events[0]["outputs"] == []
    assert ctrl.physical(50, _night())[1] is False
    ctrl.apply_rules({"guardMode": "disarmed"})
    ctrl.poll_inputs({4: True}, 100, _night())
    stopped = ctrl.poll_inputs({4: True}, 150, _night())
    assert stopped == []
    assert ctrl.physical(150, _night())[1] is False


def test_heartbeat_accepts_cabinet_temp():
    payload = kr.build_heartbeat_payload(
        {"board_temp": 24.5, "uptime_sec": 12, "reset_reason": "OTA"}
    )
    assert payload["board_temp"] == 24.5
    assert payload["uptime_sec"] == 12
    assert payload["reset_reason"] == "OTA"
    assert payload["ota_engine"] == "stream"
    assert "inputs" not in payload


def test_ntp_ready_uses_clock_once():
    ctrl = kr.KeepRisingController()
    ctrl._ntp_ready = True
    seen = {}

    def fake_time():
        seen["called"] = True
        return _day()

    original = kr.time.time
    kr.time.time = fake_time
    try:
        assert ctrl.schedule_open(_night()) is False
        assert seen["called"] is True
    finally:
        kr.time.time = original


def test_server_jst_before_ntp():
    ctrl = kr.KeepRisingController()
    ctrl.note_server_jst(21 * 60)
    assert ctrl.schedule_open(_day()) is True


def test_patlite_off_leaves_the_floods():
    ctrl = kr.KeepRisingController()
    ctrl.apply_rules(
        {"patliteThreatEnabled": False, "beamLinkMode": "staged_steady"}
    )
    ctrl.seed_inputs({2: False}, 0)
    events = _rise(ctrl, {2: True}, 0, _night())
    assert events[0]["outputs"] == [2, 3]
    assert ctrl.physical(80, _night())[1] is False
    assert ctrl.physical(80, _night())[2] is True


def test_manual_light_ignores_daytime():
    ctrl = kr.KeepRisingController()
    ctrl.apply_command(
        {
            "command": "manual",
            "channels": [2],
            "durationSec": 15,
            "release": False,
        },
        1000,
    )
    assert ctrl.physical(1000, _day())[2] is True
    assert ctrl.physical(1000, _day())[1] is False
    ctrl.apply_command(
        {"command": "manual", "channels": [2], "release": True},
        2000,
    )
    assert ctrl.physical(2000, _day())[2] is False


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
    assert 'BEAM_LINK_MODE = "staged_steady"' in cfg
    assert "STAGE_WINDOW_SEC = 60" in cfg
    assert "time.sleep(" not in (ROOT / "firmware" / "keeprising_security.py").read_text(
        encoding="utf-8"
    )
    assert kr.TENANT_ID == "KEEPRISING001"
    assert kr.DI_DEBOUNCE_MS == 50
    assert "_boot_wait(2000)" in text
    assert "timeout=4" in text
    assert "sync_ntp" in text


if __name__ == "__main__":
    test_window_crosses_midnight()
    test_staged_steady_follows_each_beam()
    test_di2_then_di3_within_window_adds_office_light()
    test_di3_after_the_window_is_floods_only()
    test_same_poll_counts_di3_as_staged()
    test_full_mode_arms_every_output()
    test_notify_mode_never_drives_relays()
    test_daytime_notifies_without_outputs()
    test_daytime_relay_test_arms_outside_the_window()
    test_unknown_clock_still_links()
    test_day_test_forces_outputs()
    test_blink_mode_and_confirm_rules()
    test_lights_drop_when_the_window_ends()
    test_notify_and_off_skip_outputs()
    test_heartbeat_accepts_cabinet_temp()
    test_ntp_ready_uses_clock_once()
    test_server_jst_before_ntp()
    test_patlite_off_leaves_the_floods()
    test_manual_light_ignores_daytime()
    test_main_keeps_relays_ahead_of_network()
    print("ok")

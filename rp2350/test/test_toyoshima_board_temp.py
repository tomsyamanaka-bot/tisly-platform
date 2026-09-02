"""toyoshima_security 豊島邸制御ロジックのホストテスト。"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware"))

import toyoshima_security as ts


def test_identifiers():
    assert ts.TENANT_ID == "TOYOSHIMA001"
    assert ts.SITE_ID == "SEC-JP-TOYOSHIMA-001"
    assert ts.DI_DEBOUNCE_MS == 100
    assert ts.HEARTBEAT_INTERVAL_SEC == 300
    assert ts.WDT_TIMEOUT_MS == 8000
    assert ts.BOARD_TEMP_OVERHEAT_C == 60.0


def test_build_heartbeat_payload_shape():
    with patch.object(ts, "read_board_temperature_c", return_value=36.5):
        payload = ts.build_heartbeat_payload(
            "main",
            site_id="SEC-JP-TOYOSHIMA-001",
            device_id="rp2350-main",
        )
    assert payload["building"] == "main"
    assert payload["siteId"] == "SEC-JP-TOYOSHIMA-001"
    assert payload["tenantId"] == "TOYOSHIMA001"
    assert payload["deviceId"] == "rp2350-main"
    assert payload["board_temp"] == 36.5
    assert "overheat" not in payload


def test_heartbeat_overheat_flag():
    with patch.object(ts, "read_board_temperature_c", return_value=62.0):
        payload = ts.build_heartbeat_payload("detached")
    assert payload["board_temp"] == 62.0
    assert payload["overheat"] is True
    assert payload["overheat_flag"] is True


def test_temperature_formula_from_voltage():
    target_c = 42.0
    voltage = 0.706 + (27 - target_c) * 0.001721
    temp = 27 - (voltage - 0.706) / 0.001721
    assert abs(temp - target_c) < 0.001


def test_main_schedule_lights_vs_patlite():
    """夜間はライト可、日中は通知武装のみ（ライト不可）。"""
    outputs = {}

    def set_ch(ch, on):
        outputs[ch] = on

    ctrl = ts.ToyoshimaMainHouseController(set_ch)
    # JST 21:00 = UTC 12:00
    utc_night = 12 * 3600
    with patch.object(ts.time, "time", return_value=utc_night):
        assert ctrl._is_armed_now() is True
        assert ctrl._can_run_lights() is True
    # JST 12:00 = UTC 03:00
    utc_day = 3 * 3600
    with patch.object(ts.time, "time", return_value=utc_day):
        assert ctrl._is_armed_now() is True
        assert ctrl._can_run_lights() is False


def test_detached_event_messages():
    events = []

    def send_event(building, di, message):
        events.append((building, di, message))

    ctrl = ts.ToyoshimaDetachedController(lambda c, o: None, send_event)
    with patch.object(ts.asyncio, "create_task", MagicMock()):
        ctrl._fire_di(1)
        ctrl._fire_di(2)
    assert events[0] == ("detached", 1, "はなれ 道路側検知")
    assert events[1] == ("detached", 2, "はなれ 通路側検知")


def test_main_event_message():
    events = []

    def send_event(building, di, message):
        events.append((building, di, message))

    ctrl = ts.ToyoshimaMainHouseController(lambda c, o: None, send_event)
    with patch.object(ts.asyncio, "create_task", MagicMock()):
        ctrl._fire_di(1)
    assert events[0][2] == "母屋 遠近検知"


def test_kick_watchdog_none_safe():
    ts.kick_watchdog(None)


def test_init_watchdog_host_returns_none():
    # ホスト PC では machine.WDT が無い想定
    wdt = ts.init_watchdog(8000)
    assert wdt is None or hasattr(wdt, "feed")


if __name__ == "__main__":
    test_identifiers()
    test_build_heartbeat_payload_shape()
    test_heartbeat_overheat_flag()
    test_temperature_formula_from_voltage()
    test_main_schedule_lights_vs_patlite()
    test_detached_event_messages()
    test_main_event_message()
    test_kick_watchdog_none_safe()
    test_init_watchdog_host_returns_none()
    print("ok")

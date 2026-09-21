"""toyoshima_security 豊島邸制御ロジックのホストテスト。"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
import asyncio

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware"))

import toyoshima_security as ts


def test_identifiers():
    assert ts.TENANT_ID == "TOYOSHIMA001"
    assert ts.SITE_ID == "SEC-JP-TOYOSHIMA-001"
    assert ts.DI_DEBOUNCE_MS == 100
    assert ts.HEARTBEAT_INTERVAL_SEC == 300
    assert ts.HEARTBEAT_RETRY_MAX == 3
    assert ts.HEARTBEAT_RETRY_WAIT_SEC == 10
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
    assert payload["boardTemp"] == 36.5
    assert "overheat" not in payload


def test_heartbeat_overheat_flag():
    with patch.object(ts, "read_board_temperature_c", return_value=62.0):
        payload = ts.build_heartbeat_payload("detached")
    assert payload["board_temp"] == 62.0
    assert payload["overheat"] is True
    assert payload["overheat_flag"] is True


def test_heartbeat_measured_temp_overrides_extra():
    with patch.object(ts, "read_board_temperature_c", return_value=41.7):
        payload = ts.build_heartbeat_payload(
            "main", extra={"board_temp": 1.0, "boardTemp": 1.0}
        )
    assert payload["board_temp"] == 41.7
    assert payload["boardTemp"] == 41.7


def test_read_board_temperature_prefers_core_temp():
    """RP2350 では ADC(4) が GPIO 誤認される。"""
    ts._CHIP_TEMP_ADC = None
    target_c = 36.2
    voltage = 0.706 + (27 - target_c) * 0.001721
    raw_u16 = int(round(voltage / 3.3 * 65535))

    class FakeADC:
        CORE_TEMP = 8

        def __init__(self, ch):
            if ch == 4:
                raise ValueError("Pin doesn't have ADC capabilities")
            assert ch == 8
            self.ch = ch

        def read_u16(self):
            return raw_u16

    fake_machine = type("machine", (), {"ADC": FakeADC})
    with patch.dict(sys.modules, {"machine": fake_machine}):
        temp = ts.read_board_temperature_c()
    ts._CHIP_TEMP_ADC = None
    assert abs(temp - target_c) < 0.2


def test_temperature_formula_from_voltage():
    conversion_factor = 3.3 / 65535
    target_c = 42.0
    voltage = 0.706 + (27 - target_c) * 0.001721
    reading = int(round(voltage / 3.3 * 65535)) * conversion_factor
    board_temp = round(27 - (reading - 0.706) / 0.001721, 1)
    assert abs(board_temp - target_c) < 0.2


def test_main_schedule_lights_vs_patlite():
    """夜間はライト可、日中は通知武装のみ（ライト不可）。"""
    outputs = {}

    def set_ch(ch, on):
        outputs[ch] = on

    ctrl = ts.ToyoshimaMainHouseController(set_ch)
    ctrl._force_relay_test = False
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


def test_force_relay_test_allows_daytime_relays():
    ctrl = ts.ToyoshimaMainHouseController(lambda c, o: None)
    ctrl.apply_rules({"force_relay_test": True, "security_mode": "2STEP"})
    utc_day = 3 * 3600
    with patch.object(ts.time, "time", return_value=utc_day):
        assert ctrl._can_run_lights() is True
        plan = ctrl.plan_main_response(1)
    assert plan["do1"] is True
    assert plan["do2"] is False


def test_manual_do_bypasses_daytime_schedule():
    outputs = {}

    def set_ch(ch, on):
        outputs[ch] = on

    ctrl = ts.ToyoshimaMainHouseController(set_ch)
    utc_day = 3 * 3600
    with patch.object(ts.time, "time", return_value=utc_day):
        ok = asyncio.run(ctrl.execute_manual_command("do1_on"))
        ok2 = asyncio.run(ctrl.execute_manual_command("bulk_on"))
    assert ok is True
    assert ok2 is True
    assert outputs[1] is True
    assert outputs[2] is True
    assert outputs[3] is True


def test_force_relay_kicks_gpio_on_daytime_di1():
    outputs = {}

    def set_ch(ch, on):
        outputs[ch] = on

    ctrl = ts.ToyoshimaMainHouseController(set_ch)
    ctrl.apply_rules({"force_relay_test": True, "security_mode": "2STEP"})
    utc_day = 3 * 3600
    with patch.object(ts.time, "time", return_value=utc_day):
        plan = ctrl.plan_main_response(1)
        ctrl._kick_relays_now(plan)
    assert plan["do1"] is True
    assert outputs[1] is True


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
    assert events[0][2] == "⚠️ 外周で接近検知"


def test_twostep_di1_only_light1_at_night():
    ctrl = ts.ToyoshimaMainHouseController(lambda c, o: None)
    ctrl.apply_rules({
        "security_mode": "2STEP",
        "light_schedule": {"start": "18:00", "end": "06:00"},
        "light_duration_sec": 30,
        "flash_duration_sec": 15,
        "flash_enabled": True,
    })
    utc_night = 12 * 3600
    with patch.object(ts.time, "time", return_value=utc_night):
        plan = ctrl.plan_main_response(1)
    assert plan["do1"] is True
    assert plan["do2"] is False
    assert plan["do3"] is False
    assert plan["message"] == "⚠️ 外周で接近検知"
    assert plan["light_ms"] == 30_000


def test_twostep_di2_full_and_flash_at_night():
    ctrl = ts.ToyoshimaMainHouseController(lambda c, o: None)
    ctrl.apply_rules({
        "securityMode": "2STEP",
        "flashEnabled": True,
        "flashDurationSec": 15,
    })
    utc_night = 12 * 3600
    with patch.object(ts.time, "time", return_value=utc_night):
        plan = ctrl.plan_main_response(2)
    assert plan["do1"] is True
    assert plan["do2"] is True
    assert plan["do3"] is True
    assert plan["flash_ms"] == 15_000
    assert plan["message"] == "🚨 建物至近で侵入検知！"


def test_direct_di1_full_response():
    ctrl = ts.ToyoshimaMainHouseController(lambda c, o: None)
    ctrl.apply_rules({"security_mode": "DIRECT", "flash_enabled": True})
    utc_night = 12 * 3600
    with patch.object(ts.time, "time", return_value=utc_night):
        plan = ctrl.plan_main_response(1)
    assert plan["do1"] is True
    assert plan["do2"] is True
    assert plan["do3"] is True


def test_silent_skips_outputs():
    ctrl = ts.ToyoshimaMainHouseController(lambda c, o: None)
    ctrl.apply_rules({"security_mode": "SILENT", "flash_enabled": True})
    utc_night = 12 * 3600
    with patch.object(ts.time, "time", return_value=utc_night):
        plan = ctrl.plan_main_response(2)
    assert plan["do1"] is False
    assert plan["do2"] is False
    assert plan["do3"] is False


def test_kick_watchdog_none_safe():
    ts.kick_watchdog(None)


def test_init_watchdog_host_returns_none():
    # ホスト PC では machine.WDT が無い想定
    wdt = ts.init_watchdog(8000)
    assert wdt is None or hasattr(wdt, "feed")


def test_send_heartbeat_with_retry_retries_three_times():
    calls = {"n": 0}

    def fail(_building=None):
        calls["n"] += 1
        raise OSError("timeout")

    with patch.object(ts.time, "sleep"):
        ok = ts.send_heartbeat_with_retry(fail, "main")
    assert ok is False
    assert calls["n"] == 3


def test_send_heartbeat_with_retry_stops_on_success():
    calls = {"n": 0}

    def flaky(_building=None):
        calls["n"] += 1
        return calls["n"] >= 2

    with patch.object(ts.time, "sleep"):
        ok = ts.send_heartbeat_with_retry(flaky, "main")
    assert ok is True
    assert calls["n"] == 2


def test_send_toyoshima_heartbeat_http_exception_returns_false():
    def boom(_path, _payload):
        raise OSError("dns fail")

    ok = ts.send_toyoshima_heartbeat(boom, "main")
    assert ok is False


if __name__ == "__main__":
    test_identifiers()
    test_build_heartbeat_payload_shape()
    test_heartbeat_overheat_flag()
    test_heartbeat_measured_temp_overrides_extra()
    test_read_board_temperature_prefers_core_temp()
    test_temperature_formula_from_voltage()
    test_main_schedule_lights_vs_patlite()
    test_detached_event_messages()
    test_main_event_message()
    test_twostep_di1_only_light1_at_night()
    test_twostep_di2_full_and_flash_at_night()
    test_direct_di1_full_response()
    test_silent_skips_outputs()
    test_kick_watchdog_none_safe()
    test_init_watchdog_host_returns_none()
    test_send_heartbeat_with_retry_retries_three_times()
    test_send_heartbeat_with_retry_stops_on_success()
    test_send_toyoshima_heartbeat_http_exception_returns_false()
    print("ok")

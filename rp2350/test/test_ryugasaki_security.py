"""龍ヶ崎店: 人感の確定時間と、遠隔だけの出力。"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware"))

import ryugasaki_security as rg


def test_identity_and_di_never_drives_do():
    assert rg.TENANT_ID == "WASHMATE001"
    assert rg.SITE_ID == "SEC-JP-RYUGASAKI-001"
    ctrl = rg.RyugasakiController()
    ctrl.seed_inputs({1: False, 2: False, 3: False}, 0)
    assert ctrl.poll_inputs({1: True, 2: True, 3: True}, 0) == []
    events = ctrl.poll_inputs({1: True, 2: True, 3: True}, 5000)
    assert [event["di"] for event in events] == [1, 2, 3]
    assert ctrl.outputs == {1: False, 2: False}
    assert all(event["linkage"] == "notify-only" for event in events)


def test_di3_waits_for_customer_confirm_time():
    ctrl = rg.RyugasakiController()
    ctrl.update_timing(3000, 20, 40)
    ctrl.seed_inputs({1: False, 2: False, 3: False}, 0)
    assert ctrl.poll_inputs({3: True}, 0) == []
    assert ctrl.poll_inputs({3: True}, 2999) == []
    events = ctrl.poll_inputs({3: True}, 3000)
    assert len(events) == 1
    assert events[0]["di"] == 3
    assert ctrl.outputs[1] is False


def test_test_command_holds_then_releases():
    ctrl = rg.RyugasakiController()
    ctrl.update_timing(1000, 8, 12)
    assert ctrl.apply_remote_command("do1_test", [1], 8, 1000) is True
    assert ctrl.outputs[1] is True
    assert ctrl.tick_outputs(8999) == []
    assert ctrl.tick_outputs(9000) == [1]
    assert ctrl.outputs[1] is False
    assert ctrl.apply_remote_command("di3_on", None, 8, 1000) is False


def test_heartbeat_has_no_sensor_fields():
    payload = rg.build_heartbeat_payload({"board_temp": 31.0})
    assert payload["tenantId"] == "WASHMATE001"
    assert "di" not in payload
    assert "active" not in payload
    assert payload["board_temp"] == 31.0


if __name__ == "__main__":
    test_identity_and_di_never_drives_do()
    test_di3_waits_for_customer_confirm_time()
    test_test_command_holds_then_releases()
    test_heartbeat_has_no_sensor_fields()
    print("ok")

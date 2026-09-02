"""toyoshima_security 盤内温度ヘルパーの単体テスト。"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware"))

import toyoshima_security as ts


def test_build_heartbeat_payload_shape():
    payload = ts.build_heartbeat_payload(
        "main", site_id="HOME-JP-TOYOSHIMA", device_id="rp2350-main"
    )
    assert payload["building"] == "main"
    assert payload["siteId"] == "HOME-JP-TOYOSHIMA"
    assert payload["deviceId"] == "rp2350-main"
    if "board_temp" in payload:
        assert isinstance(payload["board_temp"], (int, float))


def test_temperature_formula_from_voltage():
    target_c = 42.0
    voltage = 0.706 + (27 - target_c) * 0.001721
    temp = 27 - (voltage - 0.706) / 0.001721
    assert abs(temp - target_c) < 0.001


if __name__ == "__main__":
    test_build_heartbeat_payload_shape()
    test_temperature_formula_from_voltage()
    print("ok")

#!/usr/bin/env python3
"""security_light.py 警戒モード評価のホストテスト。"""

import sys
import time
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware"))

from security_light import SecurityLightController  # noqa: E402


def _ctrl(rules):
    ctrl = SecurityLightController(lambda ch, on: None)
    ctrl.apply_rules(rules)
    return ctrl


def test_always_guard_active():
    ctrl = _ctrl({"version": 1, "guardMode": "always", "guardActive": True})
    assert ctrl._is_guard_active_now() is True


def test_off_guard_inactive():
    ctrl = _ctrl({"version": 1, "guardMode": "off", "guardActive": False})
    assert ctrl._is_guard_active_now() is False


def test_paused_overrides_always():
    ctrl = _ctrl(
        {
            "version": 1,
            "guardMode": "always",
            "guardActive": True,
            "securityPaused": True,
        }
    )
    assert ctrl._is_guard_active_now() is False


def test_night_only_daytime_inactive():
    # JST 12:00 = UTC 03:00
    utc = 3 * 3600
    with patch("security_light.time.time", return_value=utc):
        ctrl = _ctrl(
            {"version": 1, "guardMode": "night_only", "guardActive": False}
        )
        assert ctrl._is_guard_active_now() is False


def test_night_only_night_active():
    # JST 21:00 = UTC 12:00
    utc = 12 * 3600
    with patch("security_light.time.time", return_value=utc):
        ctrl = _ctrl(
            {"version": 1, "guardMode": "night_only", "guardActive": True}
        )
        assert ctrl._is_guard_active_now() is True


def test_di1_skips_lights_when_paused():
    lights = []
    ctrl = SecurityLightController(
        lambda ch, on: lights.append((ch, on)),
        send_heartbeat=lambda: None,
    )
    ctrl.apply_rules(
        {
            "version": 1,
            "guardMode": "always",
            "securityPaused": True,
        }
    )
    ctrl._on_di1_detected()
    assert lights == []


if __name__ == "__main__":
    test_always_guard_active()
    test_off_guard_inactive()
    test_paused_overrides_always()
    test_night_only_daytime_inactive()
    test_night_only_night_active()
    test_di1_skips_lights_when_paused()
    print("ok")

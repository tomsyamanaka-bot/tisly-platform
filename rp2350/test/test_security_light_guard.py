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


def test_always_guard_active_at_night():
    # JST 21:00 = UTC 12:00 — ライト時間帯内
    utc = 12 * 3600
    with patch("security_light.time.time", return_value=utc):
        ctrl = _ctrl({"version": 1, "guardMode": "always", "guardActive": True})
        assert ctrl._is_guard_active_now() is True


def test_always_daytime_lights_off():
    # JST 12:00 = UTC 03:00 — ライト時間帯外
    utc = 3 * 3600
    with patch("security_light.time.time", return_value=utc):
        ctrl = _ctrl({"version": 1, "guardMode": "always", "guardActive": True})
        assert ctrl._is_armed_now() is True
        assert ctrl._can_run_lights() is False
        assert ctrl._is_guard_active_now() is False


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


def test_scheduled_custom_window():
    # JST 20:00 = UTC 11:00 — 19:00〜06:00 内
    utc = 11 * 3600
    with patch("security_light.time.time", return_value=utc):
        ctrl = _ctrl(
            {
                "version": 5,
                "guardMode": "scheduled",
                "scheduleStart": "19:00",
                "scheduleEnd": "06:00",
            }
        )
        assert ctrl._is_guard_active_now() is True
    # JST 12:00 = UTC 03:00 — 窓外
    utc_day = 3 * 3600
    with patch("security_light.time.time", return_value=utc_day):
        ctrl2 = _ctrl(
            {
                "version": 6,
                "guardMode": "scheduled",
                "scheduleStart": "19:00",
                "scheduleEnd": "06:00",
            }
        )
        assert ctrl2._is_guard_active_now() is False


def test_version_bump_applies_mode_change():
    ctrl = _ctrl({"version": 10, "guardMode": "always"})
    assert ctrl._guard_mode == "always"
    ok = ctrl.apply_rules({"version": 11, "guardMode": "off"})
    assert ok is True
    assert ctrl._guard_mode == "off"
    skipped = ctrl.apply_rules({"version": 11, "guardMode": "always"})
    assert skipped is False
    assert ctrl._guard_mode == "off"


def test_di1_daytime_logs_without_lights():
    import security_light as sl

    lights = []
    ctrl = SecurityLightController(
        lambda ch, on: lights.append((ch, on)),
        send_heartbeat=lambda: None,
    )
    utc = 3 * 3600
    sl.time.ticks_ms = lambda: 0
    sl.time.ticks_add = lambda a, b: a + b
    sl.time.ticks_diff = lambda a, b: a - b
    with patch("security_light.time.time", return_value=utc):
        ctrl.apply_rules(
            {"version": 2, "guardMode": "night_only", "guardActive": False}
        )
        assert ctrl._is_armed_now() is True
        assert ctrl._can_run_lights() is False
        ctrl._on_di1_detected()
    assert lights == []


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


def test_light_start_end_alias():
    utc = 12 * 3600
    with patch("security_light.time.time", return_value=utc):
        ctrl = _ctrl(
            {
                "version": 7,
                "guardMode": "always",
                "light_start": "19:00",
                "light_end": "06:00",
            }
        )
        assert ctrl._light_start == "19:00"
        assert ctrl._is_in_light_schedule() is True


def test_lighting_duration_sec_applied():
    ctrl = _ctrl(
        {
            "version": 3,
            "guardMode": "always",
            "lighting_duration_sec": 90,
        }
    )
    assert ctrl._di1_duration_ms == 90_000
    assert ctrl._di2_duration_ms == 90_000


def test_default_di_confirm_ms_is_50():
    """既定の継続 ON 確定は 50ms（早歩き対応）。"""
    ctrl = SecurityLightController(lambda ch, on: None)
    assert ctrl._di_confirm_ms == 50


def test_apply_rules_accepts_50ms_confirm():
    """ルール同期で 50ms 確定を受け入れる。"""
    ctrl = _ctrl(
        {
            "version": 20,
            "guardMode": "always",
            "diConfirmMs": 50,
        }
    )
    assert ctrl._di_confirm_ms == 50


def test_apply_rules_rejects_too_short_confirm():
    """49ms 未満は採用せず既定を維持。"""
    ctrl = SecurityLightController(lambda ch, on: None)
    assert ctrl._di_confirm_ms == 50
    ctrl.apply_rules(
        {
            "version": 21,
            "guardMode": "always",
            "diConfirmMs": 10,
        }
    )
    assert ctrl._di_confirm_ms == 50


if __name__ == "__main__":
    test_always_guard_active_at_night()
    test_always_daytime_lights_off()
    test_off_guard_inactive()
    test_paused_overrides_always()
    test_night_only_daytime_inactive()
    test_night_only_night_active()
    test_scheduled_custom_window()
    test_version_bump_applies_mode_change()
    test_di1_daytime_logs_without_lights()
    test_di1_skips_lights_when_paused()
    test_lighting_duration_sec_applied()
    test_default_di_confirm_ms_is_50()
    test_apply_rules_accepts_50ms_confirm()
    test_apply_rules_rejects_too_short_confirm()
    print("ok")

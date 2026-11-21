"""GPIO44 ミリ波の確定と滞留。実機ピンは使わない。"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "firmware"))

import mmwave_gpio44 as wave


def test_approach_then_dwell_then_clear():
    wave.reset_state_for_test()
    assert wave.step_level(1, 0, 5000) is None
    assert wave.step_level(1, 100, 5000) == "approach"
    assert wave.step_level(1, 200, 5000) is None
    assert wave.step_level(1, 5099, 5000) is None
    assert wave.step_level(1, 5100, 5000) == "dwell"
    assert wave.step_level(1, 8000, 5000) is None
    assert wave.step_level(0, 8100, 5000) is None
    assert wave.step_level(0, 8200, 5000) == "clear"
    assert wave.step_level(0, 9000, 5000) is None


def test_bounce_does_not_notify():
    wave.reset_state_for_test()
    assert wave.step_level(1, 0, 5000) is None
    assert wave.step_level(0, 50, 5000) is None
    assert wave.step_level(0, 200, 5000) is None


def test_dwell_seconds_clamp():
    assert wave.clamp_dwell_sec(None) == 3
    assert wave.clamp_dwell_sec(0) == 1
    assert wave.clamp_dwell_sec(999) == 300


if __name__ == "__main__":
    test_approach_then_dwell_then_clear()
    test_bounce_does_not_notify()
    test_dwell_seconds_clamp()
    print("mmwave gpio44 ok")

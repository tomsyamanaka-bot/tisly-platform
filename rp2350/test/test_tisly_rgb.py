"""tisly_rgb.py の出荷判定色をホストで検証する。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware" / "lib"))

import tisly_rgb as rgb  # noqa: E402


class TislyRgbHostTest(unittest.TestCase):
    def test_status_colors(self) -> None:
        self.assertEqual(rgb.normalize_status("red"), rgb.STATUS_UNCONFIGURED)
        self.assertEqual(rgb.normalize_status("blue"), rgb.STATUS_CONFIGURED)
        self.assertEqual(rgb.normalize_status("green"), rgb.STATUS_SHIPPABLE)
        red = rgb.color_for_status(rgb.STATUS_UNCONFIGURED, True)
        blue = rgb.color_for_status(rgb.STATUS_CONFIGURED, True)
        green = rgb.color_for_status(rgb.STATUS_SHIPPABLE, True, 48)
        self.assertGreater(red[0], 0)
        self.assertEqual(red[1], 0)
        self.assertEqual(blue[2], 48)
        self.assertGreater(green[1], 0)
        self.assertEqual(rgb.color_for_status("FAULT", False), (0, 0, 0))

    def test_set_status_without_hardware(self) -> None:
        led = rgb.TislyRgb(pin_no=2, count=1)
        self.assertEqual(led.set_status("CONFIGURED"), rgb.STATUS_CONFIGURED)
        self.assertEqual(led.set_status("SHIPPABLE"), rgb.STATUS_SHIPPABLE)
        led.tick(now_ms=1000)
        self.assertEqual(led.status, rgb.STATUS_SHIPPABLE)


if __name__ == "__main__":
    unittest.main()

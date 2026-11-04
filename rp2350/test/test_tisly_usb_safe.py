"""PoE 単独起動で print と boot.py が止まらないこと。"""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware" / "lib"))

import tisly_usb_safe as usb  # noqa: E402


class UsbSafeHostTest(unittest.TestCase):
    def tearDown(self) -> None:
        import builtins

        if usb._orig is not None:
            builtins.print = usb._orig
        usb._installed = False
        usb._drop = True

    def test_dropped_print_returns(self) -> None:
        usb.install()
        usb.note_host(False)
        print("poe-only")

    def test_boot_does_not_print(self) -> None:
        text = (ROOT / "firmware" / "boot.py").read_text(encoding="utf-8")
        for line in text.splitlines():
            code = line.split("#", 1)[0]
            self.assertNotIn("print(", code)

    def test_poe_mains_arm_before_the_loop(self) -> None:
        keep = (ROOT / "firmware" / "main_keeprising.py").read_text(encoding="utf-8")
        body = keep.split("def _run", 1)[1]
        self.assertLess(body.index("_arm_usb"), body.index("init_network"))
        self.assertLess(body.index("poll_and_drive"), body.index("init_network"))
        self.assertNotIn("sys.stdin", keep)
        ryu = (ROOT / "firmware" / "main_ryugasaki.py").read_text(encoding="utf-8")
        run = ryu.split("def _run", 1)[1]
        self.assertLess(run.index("_arm_usb"), run.index("init_network"))
        self.assertLess(run.index("scan()"), run.index("init_network"))
        self.assertNotIn("heartbeat_with_retry", run)


if __name__ == "__main__":
    unittest.main()

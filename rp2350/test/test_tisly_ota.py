"""tisly_ota.py の A/B ロールバックをホストで検証する。"""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware" / "lib"))


class TislyOtaHostTest(unittest.TestCase):
    def setUp(self) -> None:
        self._cwd = os.getcwd()
        self._tmp = tempfile.mkdtemp(prefix="tisly-ota-")
        os.chdir(self._tmp)

    def tearDown(self) -> None:
        os.chdir(self._cwd)
        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_syntax_and_backup_restore(self) -> None:
        import tisly_ota as ota

        Path("main.py").write_text("x = 1\n", encoding="utf-8")
        self.assertTrue(ota._syntax_ok("main.py", "y = 2\n"))
        self.assertFalse(ota._syntax_ok("main.py", "def (\n"))
        self.assertTrue(ota._apply_file("main.py", "y = 2\n"))
        self.assertEqual(Path("main.py").read_text(encoding="utf-8"), "y = 2\n")
        self.assertEqual(
            Path("main_backup.py").read_text(encoding="utf-8"), "x = 1\n"
        )
        Path("ota_pending.txt").write_text("1.0.1", encoding="utf-8")
        Path("ota_boot_started").write_text("1", encoding="utf-8")
        restored = ota.recover_if_needed()
        self.assertTrue(restored)
        self.assertEqual(Path("main.py").read_text(encoding="utf-8"), "x = 1\n")


if __name__ == "__main__":
    unittest.main()

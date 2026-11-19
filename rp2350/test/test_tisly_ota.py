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

    def test_syntax_error_rolls_back_before_boot(self) -> None:
        import tisly_ota as ota

        Path("main_backup.py").write_text("old = 1\n", encoding="utf-8")
        Path("main.py").write_text("def (\n", encoding="utf-8")
        Path("ota_pending.txt").write_text("1.2.62", encoding="utf-8")
        self.assertTrue(ota.recover_if_needed())
        self.assertEqual(Path("main.py").read_text(encoding="utf-8"), "old = 1\n")
        self.assertFalse(Path("ota_pending.txt").exists())

    def test_chunked_body_and_byte_digest(self) -> None:
        import tisly_ota as ota

        pieces = [b"5\r\nhello", b"\r\n0\r\n\r\n"]

        def read():
            if not pieces:
                return b""
            return pieces.pop(0)

        out = bytearray()
        self.assertTrue(ota._write_chunked(b"", read, out.extend, None))
        self.assertEqual(bytes(out), b"hello")

        class BytesDigest:
            def hexdigest(self):
                return b"AbC"

        self.assertEqual(ota._sha_hex(BytesDigest()), "abc")

    def test_update_required_replaces_without_touching_config(self) -> None:
        import json
        import tisly_ota as ota

        Path("main.py").write_text("old = 1\n", encoding="utf-8")
        Path("config.py").write_text("TOKEN = 'keep'\n", encoding="utf-8")
        meta = {
            "version": "1.2.62",
            "has_ota_update": True,
            "update_required": "true",
            "files": ["main.py", "config.py"],
            "skipFiles": ["config.py"],
            "checksums": {},
        }

        def http_get(path):
            if path.startswith("/api/firmware/toyoshima/version"):
                self.assertIn("ota_engine=stream", path)
                return json.dumps(meta), 200
            if "name=main.py" in path:
                return "new = 2\n", 200
            if "config.py" in path:
                raise AssertionError(path)
            raise AssertionError(path)

        class Cfg:
            OTA_SITE = "toyoshima"
            OTA_CHANNEL = "production"
            API_BASE = "https://tisly.jp"

        ok = ota.maybe_update(
            http_get,
            config=Cfg(),
            reported_version="1.0.0",
        )
        self.assertTrue(ok)
        self.assertEqual(Path("main.py").read_text(encoding="utf-8"), "new = 2\n")
        self.assertEqual(
            Path("main_backup.py").read_text(encoding="utf-8"), "old = 1\n"
        )
        self.assertEqual(
            Path("config.py").read_text(encoding="utf-8"), "TOKEN = 'keep'\n"
        )
        self.assertTrue(Path("ota_pending.txt").exists())

    def test_bad_syntax_does_not_replace(self) -> None:
        import json
        import tisly_ota as ota

        Path("main.py").write_text("old = 1\n", encoding="utf-8")

        def http_get(path):
            if "version" in path:
                return json.dumps(
                    {
                        "version": "1.2.62",
                        "update_required": True,
                        "files": ["main.py"],
                        "skipFiles": ["config.py"],
                    }
                ), 200
            return "def (\n", 200

        class Cfg:
            OTA_SITE = "toyoshima"
            OTA_CHANNEL = "production"

        ok = ota.maybe_update(
            http_get, config=Cfg(), reported_version="1.0.0"
        )
        self.assertFalse(ok)
        self.assertEqual(Path("main.py").read_text(encoding="utf-8"), "old = 1\n")


if __name__ == "__main__":
    unittest.main()

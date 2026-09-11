"""tisly_self_test.py の出荷判定フローをホストで検証する。"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware"))
sys.path.insert(0, str(ROOT / "firmware" / "lib"))

import tisly_self_test as kit  # noqa: E402


class FakeConfig:
    API_BASE = "https://tisly.jp"
    OTA_SITE = "toyoshima"
    SITE_ID = "SEC-JP-TOYOSHIMA-001"
    TENANT_ID = "TOYOSHIMA001"
    DI_GPIO = {1: 9, 2: 10}


class TislySelfTestHostTest(unittest.TestCase):
    def setUp(self) -> None:
        self._cwd = os.getcwd()
        self._tmp = tempfile.mkdtemp(prefix="tisly-kit-")
        os.chdir(self._tmp)
        kit.reset_runner_for_test()

    def tearDown(self) -> None:
        os.chdir(self._cwd)
        shutil.rmtree(self._tmp, ignore_errors=True)
        kit.reset_runner_for_test()

    def test_config_from_py_and_persist_green(self) -> None:
        ok, blob = kit.check_config(FakeConfig)
        self.assertTrue(ok)
        self.assertEqual(blob["site_id"], "toyoshima")
        self.assertIn("DI1", blob["sensors"])
        self.assertIn("firmware", blob["ota"]["endpoint"])

        status, shippable = kit.evaluate_status(
            {"config": True, "lan": False, "heartbeat": False, "ota": False},
            None,
        )
        self.assertEqual(status, kit.STATUS_CONFIGURED)
        self.assertFalse(shippable)

        status, shippable = kit.evaluate_status(
            {"config": True, "lan": True, "heartbeat": True, "ota": True},
            None,
        )
        self.assertEqual(status, kit.STATUS_SHIPPABLE)
        self.assertTrue(shippable)

        kit.save_persisted({"shippable": True, "rgb_status": "SHIPPABLE"})
        status, shippable = kit.evaluate_status(
            {"config": True, "lan": False, "heartbeat": False, "ota": False},
            kit.load_persisted(),
        )
        self.assertEqual(status, kit.STATUS_CONFIGURED)
        self.assertTrue(shippable)
        status, shippable = kit.evaluate_status(
            {"config": True, "lan": True, "heartbeat": False, "ota": False},
            kit.load_persisted(),
        )
        self.assertEqual(status, kit.STATUS_SHIPPABLE)

    def test_runner_payload(self) -> None:
        def http_get(path):
            if path == "/api/health":
                return json.dumps({"ok": True}), 200
            if "firmware" in path:
                return json.dumps({"ok": True, "version": "1.0.0"}), 200
            return "", 404

        runner = kit.SelfTestRunner(FakeConfig, http_get=http_get)
        self.assertTrue(runner.run_config())
        self.assertTrue(runner.run_lan(True))
        self.assertTrue(runner.run_ota())
        self.assertTrue(runner.note_heartbeat(True))
        payload = runner.payload_fields()
        self.assertTrue(payload["shippable"])
        self.assertEqual(payload["rgb_status"], kit.STATUS_SHIPPABLE)
        self.assertTrue(payload["self_test"]["config"])
        self.assertTrue(Path("shippable.json").exists())


if __name__ == "__main__":
    unittest.main()

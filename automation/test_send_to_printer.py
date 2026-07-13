#!/usr/bin/env python3
"""send_to_printer() のローカル検証（モック HTTP + DRY_RUN）。"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from generate_print_data import (  # noqa: E402
    resolve_printer_backend,
    send_to_printer,
)


class _MockPrinterHandler(BaseHTTPRequestHandler):
    received: list[dict] = []

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b""
        self.received.append(
            {
                "path": self.path,
                "api_key": self.headers.get("X-Api-Key"),
                "content_type": self.headers.get("Content-Type", ""),
                "body_len": len(body),
                "has_gcode_name": b"test_part.gcode" in body,
                "has_print_true": b'name="print"\r\n\r\ntrue' in body
                or b"name=\"print\"\r\n\r\ntrue" in body,
            }
        )
        if self.path.startswith("/api/files/"):
            payload = {
                "files": {
                    "local": {
                        "name": "test_part.gcode",
                        "origin": "local",
                        "done": True,
                    }
                },
                "done": True,
            }
            raw = json.dumps(payload).encode("utf-8")
            self.send_response(201)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return

        if self.path.startswith("/server/files/upload"):
            payload = {"result": {"path": "gcodes/test_part.gcode", "exists": True}}
            raw = json.dumps(payload).encode("utf-8")
            self.send_response(201)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return

        self.send_response(404)
        self.end_headers()


def _start_mock() -> tuple[HTTPServer, str]:
    server = HTTPServer(("127.0.0.1", 0), _MockPrinterHandler)
    host, port = server.server_address
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, f"http://{host}:{port}"


def _write_sample_gcode(path: Path) -> None:
    path.write_text("; TiSLY test gcode\nG28\nM104 S200\n", encoding="utf-8")


def test_backend_resolve() -> None:
    assert resolve_printer_backend("http://192.168.1.1:5000", "auto") == "octoprint"
    assert resolve_printer_backend("http://192.168.1.1:7125", "auto") == "moonraker"
    assert resolve_printer_backend("http://x", "moonraker") == "moonraker"
    assert resolve_printer_backend("http://x", "octoprint") == "octoprint"
    print("OK resolve_printer_backend")


def test_dry_run() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        gcode = Path(tmp) / "test_part.gcode"
        _write_sample_gcode(gcode)
        os.environ["PRINTER_DRY_RUN"] = "true"
        os.environ["PRINTER_API_URL"] = "http://192.168.1.50:5000"
        os.environ["PRINTER_API_KEY"] = "dummy-key"
        os.environ["PRINTER_BACKEND"] = "octoprint"
        os.environ["PRINTER_AUTO_START"] = "true"
        result = send_to_printer(gcode, start_print=True)
        assert result.get("ok") is True
        assert result.get("dry_run") is True
        assert result.get("would_start_print") is True
        assert result.get("backend") == "octoprint"
        print("OK dry_run")


def test_octoprint_upload_mock() -> None:
    _MockPrinterHandler.received = []
    server, base = _start_mock()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            gcode = Path(tmp) / "test_part.gcode"
            _write_sample_gcode(gcode)
            os.environ["PRINTER_DRY_RUN"] = "false"
            os.environ.pop("PRINTER_FORCE_JOB_START", None)
            result = send_to_printer(
                gcode,
                api_url=base,
                api_key="test-key-123",
                backend="octoprint",
                start_print=True,
            )
            assert result.get("ok") is True, result
            assert result.get("uploaded") is True
            assert result.get("print_started") is True
            assert result.get("backend") == "octoprint"
            assert _MockPrinterHandler.received, "no POST received"
            first = _MockPrinterHandler.received[0]
            assert first["path"] == "/api/files/local"
            assert first["api_key"] == "test-key-123"
            assert first["has_gcode_name"] is True
            assert first["has_print_true"] is True
            print("OK octoprint_upload_mock")
    finally:
        server.shutdown()


def test_moonraker_upload_mock() -> None:
    _MockPrinterHandler.received = []
    server, base = _start_mock()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            gcode = Path(tmp) / "test_part.gcode"
            _write_sample_gcode(gcode)
            os.environ["PRINTER_DRY_RUN"] = "false"
            result = send_to_printer(
                gcode,
                api_url=base,
                api_key="",
                backend="moonraker",
                start_print=True,
            )
            assert result.get("ok") is True, result
            assert result.get("backend") == "moonraker"
            assert _MockPrinterHandler.received[0]["path"] == "/server/files/upload"
            assert _MockPrinterHandler.received[0]["has_print_true"] is True
            print("OK moonraker_upload_mock")
    finally:
        server.shutdown()


def test_missing_url_skips() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        gcode = Path(tmp) / "test_part.gcode"
        _write_sample_gcode(gcode)
        for key in (
            "PRINTER_API_URL",
            "PRINTER_API_KEY",
            "PRINTER_DRY_RUN",
            "PRINTER_BACKEND",
        ):
            os.environ.pop(key, None)
        result = send_to_printer(gcode, api_url="", start_print=True)
        assert result.get("skipped") is True
        assert result.get("reason") == "api_url_not_configured"
        print("OK missing_url_skips")


def main() -> int:
    test_backend_resolve()
    test_dry_run()
    test_octoprint_upload_mock()
    test_moonraker_upload_mock()
    test_missing_url_skips()
    print("\nAll send_to_printer tests passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

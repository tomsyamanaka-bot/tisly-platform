"""Restart RP2350 main.py, capture serial, queue bath pulse, verify delivery."""
import json
import threading
import time
import urllib.request
from datetime import datetime

import serial

PORT = "COM3"
BAUD = 115200
TOKEN = "tisly2026test"
API = "https://tisly.jp"
CAPTURE_SEC = 60

lines: list[tuple[str, str]] = []
stop = threading.Event()


def ts() -> str:
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def api_json(method: str, path: str, payload: dict | None = None) -> dict:
    headers = {
        "User-Agent": "tisly-rp2350-diagnostic/1.0",
        "X-Remote-Test-Token": TOKEN,
    }
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode()
    req = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode())


def reader(ser: serial.Serial) -> None:
    while not stop.is_set():
        raw = ser.readline()
        if raw:
            line = raw.decode("utf-8", errors="replace").rstrip()
            lines.append((ts(), line))
            print(f"[{ts()}] SER> {line}")


def main() -> None:
    ser = serial.Serial(PORT, BAUD, timeout=0.3)
    print(f"[{ts()}] Opened {PORT}")

    t = threading.Thread(target=reader, args=(ser,), daemon=True)
    t.start()

    # Soft reboot to restart main.py polling loop
    print(f"[{ts()}] Soft reboot (Ctrl+D)...")
    ser.write(b"\x04")
    time.sleep(8)

    before = api_json("GET", "/api/remote-test/status")
    device = api_json("GET", "/api/remote-test/device")
    print(
        f"[{ts()}] API before queue: pending={before.get('pendingCommand')} "
        f"lastPollAt={before.get('lastPollAt')} online={device.get('online')}"
    )

    # Queue Itabashi bath pulse
    home = api_json(
        "POST",
        "/api/home/v1/control",
        {
            "siteId": "HOME-JP-ITABASHI-LIVE",
            "target": "bath",
            "action": "auto_fill",
            "value": True,
        },
    )
    print(f"[{ts()}] Queued home/control: ok={home.get('ok')} msg={home.get('message')}")

    pulse = api_json(
        "POST",
        "/api/devices/rp2350/relay/1/pulse",
        {"durationMs": 500, "reason": "serial-diagnostic-live"},
    )
    print(
        f"[{ts()}] Queued relay/pulse: cmd={pulse.get('command')} "
        f"pending={pulse.get('pendingCommand')}"
    )

    print(f"[{ts()}] Capturing serial for {CAPTURE_SEC}s...")
    time.sleep(CAPTURE_SEC)
    stop.set()
    t.join(timeout=2)
    ser.close()

    after = api_json("GET", "/api/remote-test/status")
    device_after = api_json("GET", "/api/remote-test/device")
    print(
        f"[{ts()}] API after: pending={after.get('pendingCommand')} "
        f"lastPollAt={after.get('lastPollAt')} lastCommand={after.get('lastCommand')} "
        f"online={device_after.get('online')} lastSeen={device_after.get('lastSeen')} "
        f"fw={device_after.get('firmwareVersion')}"
    )

    checks = {
        "command_received": False,
        "ch1_pulse_on": False,
        "ch1_pulse_off": False,
        "http_error": False,
        "auth_403": False,
        "polling_started": False,
        "heartbeat_sent": False,
        "exception_traceback": False,
    }
    for _, line in lines:
        low = line.lower()
        if "command received: ch1_pulse_500" in line:
            checks["command_received"] = True
        if "ch1 pulse on" in low and "500" in line:
            checks["ch1_pulse_on"] = True
        if "ch1 pulse off" in low:
            checks["ch1_pulse_off"] = True
        if "[tisly] error:" in low and "http" in low:
            checks["http_error"] = True
        if "auth 403" in low:
            checks["auth_403"] = True
        if "polling start" in low:
            checks["polling_started"] = True
        if "heartbeat sent" in low:
            checks["heartbeat_sent"] = True
        if "traceback" in low:
            checks["exception_traceback"] = True

    print("--- CHECKS ---")
    for key, val in checks.items():
        print(f"  {key}: {'YES' if val else 'NO'}")

    print(f"--- TOTAL SERIAL LINES: {len(lines)} ---")


if __name__ == "__main__":
    main()

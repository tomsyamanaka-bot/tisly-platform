"""RP2350 COM3 serial capture + bath pulse queue diagnostic."""
import json
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime

PORT = "COM3"
BAUD = 115200
TOKEN = "tisly2026test"
API = "https://tisly.jp"
CAPTURE_SEC = 45

lines: list[tuple[str, str]] = []
stop = threading.Event()


def ts() -> str:
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def _headers() -> dict[str, str]:
    return {
        "X-Remote-Test-Token": TOKEN,
        "User-Agent": "tisly-rp2350-diagnostic/1.0",
    }


def api_get(path: str) -> dict:
    req = urllib.request.Request(API + path, headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        raise RuntimeError(f"GET {path} HTTP {exc.code}: {body[:200]}") from exc


def api_post(path: str, payload: dict, *, auth: bool = False) -> dict:
    headers = {"Content-Type": "application/json", "User-Agent": "tisly-rp2350-diagnostic/1.0"}
    if auth:
        headers["X-Remote-Test-Token"] = TOKEN
    body = json.dumps(payload).encode()
    req = urllib.request.Request(API + path, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode(errors="replace")
        raise RuntimeError(f"POST {path} HTTP {exc.code}: {body_text[:200]}") from exc


def reader() -> None:
    try:
        import serial

        ser = serial.Serial(PORT, BAUD, timeout=0.5)
        print(f"[{ts()}] SERIAL OPEN {PORT} @ {BAUD}")
        ser.reset_input_buffer()
        while not stop.is_set():
            raw = ser.readline()
            if raw:
                line = raw.decode("utf-8", errors="replace").rstrip()
                lines.append((ts(), line))
                print(f"[{ts()}] SER> {line}")
        ser.close()
    except Exception as exc:
        print(f"[{ts()}] SERIAL ERROR: {exc}")
        stop.set()


def main() -> int:
    t = threading.Thread(target=reader, daemon=True)
    t.start()
    time.sleep(2)

    try:
        status_before = api_get("/api/remote-test/status")
        device_before = api_get("/api/remote-test/device")
    except RuntimeError as exc:
        print(f"[{ts()}] API baseline error: {exc}")
        status_before = {}
        device_before = {}
    print(
        f"[{ts()}] API before: pending={status_before.get('pendingCommand')} "
        f"lastPollAt={status_before.get('lastPollAt')} "
        f"deviceOnline={not device_before.get('offline', True)} "
        f"lastSeen={device_before.get('lastSeen')}"
    )

    time.sleep(3)

    try:
        resp = api_post(
            "/api/home/v1/control",
            {
                "siteId": "HOME-JP-ITABASHI-LIVE",
                "target": "bath",
                "action": "auto_fill",
                "value": True,
            },
        )
        print(
            f"[{ts()}] QUEUE home/control: ok={resp.get('ok')} "
            f"msg={str(resp.get('message', ''))[:100]}"
        )
    except RuntimeError as exc:
        print(f"[{ts()}] QUEUE home/control error: {exc}")

    try:
        resp2 = api_post(
            "/api/devices/rp2350/relay/1/pulse",
            {"durationMs": 500, "reason": "serial-diagnostic"},
        )
        print(
            f"[{ts()}] QUEUE relay/pulse: ok={resp2.get('ok')} "
            f"cmd={resp2.get('command')} pending={resp2.get('pendingCommand')}"
        )
    except RuntimeError as exc:
        print(f"[{ts()}] QUEUE relay/pulse error: {exc}")

    print(f"[{ts()}] Listening {CAPTURE_SEC}s for RP2350 serial...")
    time.sleep(CAPTURE_SEC)
    stop.set()
    t.join(timeout=3)

    try:
        status_after = api_get("/api/remote-test/status")
        device_after = api_get("/api/remote-test/device")
    except RuntimeError as exc:
        print(f"[{ts()}] API after error: {exc}")
        status_after = {}
        device_after = {}
    print(
        f"[{ts()}] API after: pending={status_after.get('pendingCommand')} "
        f"lastPollAt={status_after.get('lastPollAt')} "
        f"lastCommand={status_after.get('lastCommand')} "
        f"deviceOnline={not device_after.get('offline', True)} "
        f"lastSeen={device_after.get('lastSeen')}"
    )

    keywords = [
        "command received",
        "ch1_pulse_500",
        "CH1 PULSE",
        "error",
        "Exception",
        "HTTP",
        "AUTH",
        "polling",
        "heartbeat",
        "Ethernet",
        "IP address",
    ]
    print("--- KEYWORD HITS ---")
    hits = [(t0, ln) for t0, ln in lines if any(k.lower() in ln.lower() for k in keywords)]
    if hits:
        for t0, ln in hits:
            print(f"  [{t0}] {ln}")
    else:
        print("  (none)")

    print(f"--- TOTAL LINES: {len(lines)} ---")
    if len(lines) <= 30:
        for t0, ln in lines:
            print(f"  [{t0}] {ln}")
    else:
        print("  (first 15)")
        for t0, ln in lines[:15]:
            print(f"  [{t0}] {ln}")
        print("  ...")
        print("  (last 15)")
        for t0, ln in lines[-15:]:
            print(f"  [{t0}] {ln}")

    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Clean RP2350 verification — one command at a time, match notifications by timestamp."""

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

API_BASE = "https://tisly.jp"
TOKEN = "tisly2026test"
SEQUENCE = [
    ("CH1 ON", 1, "on", "/api/remote-test/ch1/on"),
    ("CH1 OFF", 1, "off", "/api/remote-test/ch1/off"),
    ("CH4 ON", 4, "on", "/api/remote-test/ch4/on"),
    ("CH4 OFF", 4, "off", "/api/remote-test/ch4/off"),
    ("CH8 ON", 8, "on", "/api/remote-test/ch8/on"),
    ("CH8 OFF", 8, "off", "/api/remote-test/ch8/off"),
]


def curl_json(method: str, path: str) -> dict:
    url = API_BASE + path
    cmd = [
        "curl.exe",
        "-s",
        "-X",
        method,
        "-H",
        f"X-Remote-Test-Token: {TOKEN}",
        url,
    ]
    out = subprocess.check_output(cmd)
    return json.loads(out.decode("utf-8"))


def wait_device_poll(seconds: float = 8.0) -> None:
    time.sleep(seconds)


def main() -> int:
    t0 = datetime.now(timezone.utc).isoformat()
    print(f"Test start (UTC): {t0}")
    rows = []

    for label, ch, expected, path in SEQUENCE:
        print(f"\n>>> {label}")
        started = datetime.now(timezone.utc).isoformat()
        cmd_res = curl_json("POST", path)
        wait_device_poll(8.0)
        status = curl_json("GET", "/api/remote-test/status")
        device = curl_json("GET", "/api/remote-test/device")

        new_notes = [
            n
            for n in status.get("notificationHistory", [])
            if n.get("timestamp", n.get("at", "")) >= started
            and n.get("channel") == ch
            and n.get("to") == expected
        ]
        note = new_notes[0] if new_notes else None

        rows.append(
            {
                "action": label,
                "startedAt": started,
                "command": cmd_res.get("command"),
                "pendingAfter": status.get("pendingCommand"),
                "confirmedCh": status.get("chStates", {}).get(str(ch)),
                "expectedCh": expected,
                "deviceOnline": device.get("online"),
                "firmwareReported": device.get("firmwareVersion"),
                "lastPollAt": status.get("lastPollAt"),
                "notification": note,
                "pushSuccess": (note or {}).get("pushSuccess"),
            }
        )
        print(json.dumps(rows[-1], ensure_ascii=False, indent=2))

    print("\n| Action | confirmedCh | heartbeat(通知) | Push | device online |")
    print("|---|---|---|---|---|")
    for r in rows:
        notify = "あり" if r["notification"] else "なし"
        push = (
            "OK"
            if r.get("pushSuccess") is True
            else ("NG" if r.get("pushSuccess") is False else "-")
        )
        ch = r["confirmedCh"]
        ok = "OK" if ch == r["expectedCh"] else "NG"
        print(
            f"| {r['action']} | {ch} ({ok}) | {notify} | {push} | {r['deviceOnline']} |"
        )

    with open("rp2350/test/device_verify_clean_results.json", "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())

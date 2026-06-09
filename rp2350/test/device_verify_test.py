"""RP2350 実機検証 — CH1/CH4/CH8 ON/OFF + heartbeat / notification 確認"""

import json
import sys
import time
import urllib.error
import urllib.request

API_BASE = "https://tisly.jp"
TOKEN = "tisly2026test"
SEQUENCE = [
    ("CH1 ON", "POST", "/api/remote-test/ch1/on"),
    ("CH1 OFF", "POST", "/api/remote-test/ch1/off"),
    ("CH4 ON", "POST", "/api/remote-test/ch4/on"),
    ("CH4 OFF", "POST", "/api/remote-test/ch4/off"),
    ("CH8 ON", "POST", "/api/remote-test/ch8/on"),
    ("CH8 OFF", "POST", "/api/remote-test/ch8/off"),
]


def api(method: str, path: str, wait_after: float = 5.0) -> dict:
    url = API_BASE.rstrip("/") + path
    headers = {
        "X-Remote-Test-Token": TOKEN,
        "Authorization": f"Bearer {TOKEN}",
        "User-Agent": "TiSLY-RP2350-DeviceVerify/1.0",
    }
    data_bytes = b"" if method in ("POST", "PUT", "PATCH") else None
    req = urllib.request.Request(url, data=data_bytes, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.loads(res.read().decode())
    time.sleep(wait_after)
    return data


def fetch_status() -> dict:
    return api("GET", "/api/remote-test/status", wait_after=0)


def fetch_debug() -> dict | None:
    try:
        return api("GET", "/api/remote-test/debug", wait_after=0)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def main() -> int:
    print("=== RP2350 device verification ===")
    results = []

    for label, method, path in SEQUENCE:
        print(f"\n--- {label} ---")
        try:
            cmd_res = api(method, path, wait_after=6.0)
        except Exception as exc:
            results.append(
                {
                    "action": label,
                    "error": str(exc),
                    "heartbeat": None,
                    "notification": None,
                    "push": None,
                }
            )
            continue

        status = fetch_status()
        debug = fetch_debug()
        ch_num = int(label.split()[0][2:])
        target_state = "on" if "ON" in label else "off"

        hist = [
            h
            for h in status.get("notificationHistory", [])
            if h.get("channel") == ch_num and h.get("to") == target_state
        ]
        latest = hist[0] if hist else None

        row = {
            "action": label,
            "pendingCleared": cmd_res.get("pendingCommand") is None,
            "confirmedCh": status.get("chStates", {}).get(str(ch_num)),
            "expectedCh": target_state,
            "deviceOnline": None,
            "firmware": None,
            "heartbeatBody": debug.get("heartbeatBody") if debug else "(debug 404)",
            "confirmedChStates": debug.get("confirmedChStates") if debug else status.get("chStates"),
            "notification": latest,
            "pushSuccess": (latest or {}).get("pushSuccess"),
            "lastPushResult": status.get("lastPushResult"),
        }

        try:
            device = api("GET", "/api/remote-test/device", wait_after=0)
            row["deviceOnline"] = device.get("online")
            row["firmware"] = device.get("firmwareVersion")
        except Exception as exc:
            row["deviceError"] = str(exc)

        results.append(row)
        print(json.dumps(row, ensure_ascii=False, indent=2))

    print("\n=== SUMMARY TABLE ===")
    print(
        f"{'Action':<10} {'CH state':<10} {'Notify':<8} {'Push':<8} {'FW':<22} {'Online'}"
    )
    print("-" * 72)
    for r in results:
        if r.get("error"):
            print(f"{r['action']:<10} ERROR: {r['error']}")
            continue
        notify = "YES" if r.get("notification") else "NO"
        push = (
            "OK"
            if r.get("pushSuccess") is True
            else ("FAIL" if r.get("pushSuccess") is False else "-")
        )
        ch_ok = r.get("confirmedCh") == r.get("expectedCh")
        ch = f"{r.get('confirmedCh')} {'OK' if ch_ok else 'NG'}"
        print(
            f"{r['action']:<10} {ch:<10} {notify:<8} {push:<8} {str(r.get('firmware','?')):<22} {r.get('deviceOnline')}"
        )

    out_path = "rp2350/test/device_verify_results.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

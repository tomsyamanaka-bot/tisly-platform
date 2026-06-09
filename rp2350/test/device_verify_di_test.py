"""RP2350 Phase6 — DI1/DI4/DI8 ON/OFF 通知確認（heartbeat inputStates シミュレーション）

実機テスト: DI 接点を手動で ON/OFF し、PWA の通知履歴を確認してください。
CI/サーバー検証: 本スクリプトが heartbeat で inputStates 変化を送信し notificationHistory を照合します。
"""

import json
import sys
import time
import urllib.error
import urllib.request

API_BASE = "https://tisly.jp"
TOKEN = "tisly2026test"

ALL_OFF = {
    "1": "off",
    "2": "off",
    "3": "off",
    "4": "off",
    "5": "off",
    "6": "off",
    "7": "off",
    "8": "off",
}

ALL_CH_OFF = dict(ALL_OFF)

SEQUENCE = [
    ("DI1 ON", {"1": "on"}),
    ("DI1 OFF", {}),
    ("DI4 ON", {"4": "on"}),
    ("DI4 OFF", {}),
    ("DI8 ON", {"8": "on"}),
    ("DI8 OFF", {}),
]


def api(method: str, path: str, body: dict | None = None, wait_after: float = 0.5) -> dict:
    url = API_BASE.rstrip("/") + path
    headers = {
        "X-Remote-Test-Token": TOKEN,
        "Authorization": f"Bearer {TOKEN}",
        "User-Agent": "TiSLY-RP2350-DIVerify/1.0",
    }
    data_bytes = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data_bytes = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data_bytes, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.loads(res.read().decode())
    if wait_after:
        time.sleep(wait_after)
    return data


def send_heartbeat(input_overrides: dict) -> dict:
    payload = {
        "firmware": "1.4.0-remote-test-phase6",
        "chStates": ALL_CH_OFF,
        "inputStates": {**ALL_OFF, **input_overrides},
    }
    return api("POST", "/api/remote-test/heartbeat", payload)


def fetch_status() -> dict:
    return api("GET", "/api/remote-test/status", wait_after=0)


def main() -> int:
    print("=== RP2350 Phase6 DI verification ===")
    results = []

    # ベースライン確立
    send_heartbeat({})
    time.sleep(1)

    for label, overrides in SEQUENCE:
        print(f"\n--- {label} ---")
        di_num = int(label.split()[0][2:])
        target_state = "on" if "ON" in label else "off"
        try:
            hb_res = send_heartbeat(overrides)
        except Exception as exc:
            results.append({"action": label, "error": str(exc)})
            continue

        status = fetch_status()
        changes = hb_res.get("inputStateChanges") or []
        hist = [
            h
            for h in status.get("notificationHistory", [])
            if h.get("kind") == "di"
            and h.get("channel") == di_num
            and h.get("to") == target_state
        ]
        latest = hist[0] if hist else None
        ok = (
            len(changes) >= 1
            and any(c.get("input") == di_num and c.get("to") == target_state for c in changes)
            and latest is not None
            and latest.get("body") == f"DI{di_num} {target_state.upper()}"
        )
        results.append(
            {
                "action": label,
                "ok": ok,
                "inputStateChanges": changes,
                "notification": latest,
                "inputStates": status.get("inputStates"),
            }
        )
        print(f"  ok={ok} body={latest.get('body') if latest else None}")

    passed = sum(1 for r in results if r.get("ok"))
    total = len(SEQUENCE)
    print(f"\n=== Result: {passed}/{total} passed ===")

    out_path = "device_verify_di_results.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"Saved: {out_path}")

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())

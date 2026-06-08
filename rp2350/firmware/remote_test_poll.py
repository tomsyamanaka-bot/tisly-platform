"""
TiSLY Remote Test — HTTP ポーリング PoC (Phase 2)

RP2350-POE-ETH-8DI-8RO (MicroPython v1.28.0)
CH1 = GPIO17 (リレー出力1 / RO1)

Thonny で main として実行するか、boot.py から import してください。
ネットワーク（Ethernet/WiFi）が tisly.jp に到達できる必要があります。
"""

import time

try:
    import urequests
except ImportError:
    urequests = None

from machine import Pin

try:
    import config

    API_BASE = config.API_BASE
    REMOTE_TEST_TOKEN = config.REMOTE_TEST_TOKEN
    POLL_INTERVAL_SEC = config.POLL_INTERVAL_SEC
    HEARTBEAT_INTERVAL_SEC = config.HEARTBEAT_INTERVAL_SEC
    CH1_GPIO = config.CH1_GPIO
    FIRMWARE_VERSION = config.FIRMWARE_VERSION
except ImportError:
    API_BASE = "https://tisly.jp"
    REMOTE_TEST_TOKEN = "CHANGE_ME_SAME_AS_SERVER_ENV"
    POLL_INTERVAL_SEC = 3
    HEARTBEAT_INTERVAL_SEC = 60
    CH1_GPIO = 17
    FIRMWARE_VERSION = "1.1.0-poc-success"

# --- GPIO ---
relay_ch1 = Pin(CH1_GPIO, Pin.OUT)
relay_ch1.value(0)


def log(msg):
    print("[remote_test]", msg)


def boot_banner():
    print("")
    print("=" * 40)
    print("           TISLY BOOT")
    print("=" * 40)
    print("")


def detect_ip():
    """Ethernet / デフォルトルートから IP を取得。失敗時 (None, None)。"""
    try:
        import network

        if hasattr(network, "LAN"):
            try:
                lan = network.LAN()
                if lan.isconnected():
                    cfg = lan.ifconfig()
                    if cfg and cfg[0] and cfg[0] != "0.0.0.0":
                        return cfg[0], "Ethernet (LAN)"
            except Exception as e:
                log("LAN init: {}".format(e))

        if hasattr(network, "WLAN"):
            try:
                wlan = network.WLAN(network.STA_IF)
                if wlan.isconnected():
                    cfg = wlan.ifconfig()
                    if cfg and cfg[0]:
                        return cfg[0], "WiFi (STA)"
            except Exception:
                pass
    except ImportError:
        pass

    try:
        import socket

        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            if ip and ip != "0.0.0.0":
                return ip, "default-route"
        finally:
            s.close()
    except Exception as e:
        log("IP detect error: {}".format(e))

    return None, None


def check_ethernet():
    log("Ethernet 接続確認...")
    ip, kind = detect_ip()
    if ip:
        log("Ethernet: OK ({})".format(kind))
        log("取得IP: {}".format(ip))
        return True
    log("Ethernet: NG — LANケーブル・DHCP・W5500 lib/ を確認")
    return False


def http_get(path):
    if urequests is None:
        log("ERROR: urequests 未インストール — mpremote mip install urequests")
        return None, 0

    url = API_BASE.rstrip("/") + path
    headers = {"X-Remote-Test-Token": REMOTE_TEST_TOKEN}
    try:
        res = urequests.get(url, headers=headers)
        status = res.status_code
        body = res.text
        res.close()
        return body, status
    except OSError as e:
        log("HTTP error: {}".format(e))
        return None, 0


def check_server():
    log("サーバ接続確認: {}".format(API_BASE))
    body, status = http_get("/api/remote-test/status")
    if status == 403:
        log("サーバ接続: AUTH FAIL — REMOTE_TEST_TOKEN を確認")
        return False
    if status != 200:
        log("サーバ接続: FAIL (HTTP {})".format(status))
        return False
    log("サーバ接続: OK")
    try:
        import json

        data = json.loads(body)
        log("  CH1状態: {}".format(data.get("ch1State", "?")))
    except Exception:
        pass
    return True


def send_heartbeat():
    path = "/api/remote-test/heartbeat?firmware={}".format(FIRMWARE_VERSION)
    body, status = http_get(path)
    if status == 403:
        log("AUTH FAIL 403 — REMOTE_TEST_TOKEN を確認")
        return False
    if status != 200:
        log("heartbeat HTTP {} {}".format(status, (body or "")[:80]))
        return False
    log("heartbeat sent")
    return True


def fetch_command():
    body, status = http_get("/api/remote-test/command")
    if status == 403:
        log("AUTH FAIL 403 — REMOTE_TEST_TOKEN を確認")
        return None
    if status != 200:
        log("HTTP {} {}".format(status, (body or "")[:80]))
        return None

    try:
        import json

        data = json.loads(body)
    except Exception as e:
        log("JSON parse error: {} {}".format(e, (body or "")[:80]))
        return None

    cmd = data.get("command")
    if cmd:
        log("取得コマンド: {}".format(cmd))
    return cmd


def apply_command(cmd):
    if cmd == "ch1_on":
        relay_ch1.value(1)
        log("EXEC CH1 ON  → GPIO{} = HIGH".format(CH1_GPIO))
    elif cmd == "ch1_off":
        relay_ch1.value(0)
        log("EXEC CH1 OFF → GPIO{} = LOW".format(CH1_GPIO))
    else:
        log("poll ok — コマンドなし")


def main():
    boot_banner()
    log("CH1 GPIO{} 初期化 OFF".format(CH1_GPIO))

    eth_ok = check_ethernet()
    if not eth_ok:
        log("警告: Ethernet 未接続 — ポーリングは続行します")

    if REMOTE_TEST_TOKEN == "CHANGE_ME_SAME_AS_SERVER_ENV":
        log("ERROR: REMOTE_TEST_TOKEN を VPS .env と同じ値に設定してください")
        return

    srv_ok = check_server()
    if not srv_ok:
        log("警告: サーバ未接続 — 3秒後にリトライします")

    poll_interval_sec = int(POLL_INTERVAL_SEC)
    heartbeat_interval_sec = int(HEARTBEAT_INTERVAL_SEC)
    if heartbeat_interval_sec < poll_interval_sec:
        log(
            "警告: HEARTBEAT_INTERVAL_SEC={} < POLL={} — heartbeat を {}秒に補正".format(
                heartbeat_interval_sec, poll_interval_sec, poll_interval_sec
            )
        )
        heartbeat_interval_sec = poll_interval_sec
    heartbeat_interval_ms = heartbeat_interval_sec * 1000

    log(
        "ポーリング開始 (poll {}秒 / heartbeat {}秒)".format(
            poll_interval_sec, heartbeat_interval_sec
        )
    )
    print("")

    next_heartbeat_ms = time.ticks_ms()

    while True:
        cmd = fetch_command()
        if cmd:
            apply_command(cmd)

        now = time.ticks_ms()
        if time.ticks_diff(now, next_heartbeat_ms) >= 0:
            if send_heartbeat():
                next_heartbeat_ms = time.ticks_add(now, heartbeat_interval_ms)

        time.sleep(poll_interval_sec)


if __name__ == "__main__":
    main()

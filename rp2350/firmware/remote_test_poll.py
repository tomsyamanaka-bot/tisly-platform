"""
TiSLY Remote Test — HTTP ポーリング PoC (Phase 2, 非推奨)

main.py を使用してください。本ファイルは POST heartbeat + chStates 互換の最小実装です。
"""

import json
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
    CH_GPIO = config.CH_GPIO
    FIRMWARE_VERSION = config.FIRMWARE_VERSION
except ImportError:
    API_BASE = "https://tisly.jp"
    REMOTE_TEST_TOKEN = "CHANGE_ME_SAME_AS_SERVER_ENV"
    POLL_INTERVAL_SEC = 3
    HEARTBEAT_INTERVAL_SEC = 300
    CH_GPIO = {1: 17, 2: 18, 3: 19, 4: 20, 5: 21, 6: 22, 7: 23, 8: 24}
    FIRMWARE_VERSION = "1.3.0-remote-test-rc1"

CH_PINS = {}
for ch, gpio in CH_GPIO.items():
    pin = Pin(gpio, Pin.OUT)
    pin.value(0)
    CH_PINS[ch] = pin

ch_states = {str(ch): "off" for ch in CH_PINS}


def log(msg):
    print("[remote_test]", msg)


def _http_headers(content_type=None):
    headers = {"X-Remote-Test-Token": REMOTE_TEST_TOKEN}
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def http_get(path):
    if urequests is None:
        log("ERROR: urequests 未インストール")
        return None, 0
    url = API_BASE.rstrip("/") + path
    try:
        res = urequests.get(url, headers=_http_headers())
        status = res.status_code
        body = res.text
        res.close()
        return body, status
    except OSError as e:
        log("HTTP error: {}".format(e))
        return None, 0


def http_post(path, payload):
    if urequests is None:
        log("ERROR: urequests 未インストール")
        return None, 0
    url = API_BASE.rstrip("/") + path
    try:
        body = json.dumps(payload)
        res = urequests.post(url, headers=_http_headers("application/json"), data=body)
        status = res.status_code
        text = res.text
        res.close()
        return text, status
    except OSError as e:
        log("HTTP POST error: {}".format(e))
        return None, 0


def send_heartbeat():
    path = "/api/remote-test/heartbeat"
    payload = {"firmware": FIRMWARE_VERSION, "chStates": dict(ch_states)}
    body, status = http_post(path, payload)
    if status == 403:
        log("AUTH FAIL 403 — REMOTE_TEST_TOKEN を確認")
        return False
    if status != 200:
        log("heartbeat HTTP {} {}".format(status, (body or "")[:80]))
        return False
    log("heartbeat sent (POST chStates)")
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
        data = json.loads(body)
    except Exception as e:
        log("JSON parse error: {} {}".format(e, (body or "")[:80]))
        return None
    cmd = data.get("command")
    if cmd:
        log("取得コマンド: {}".format(cmd))
    return cmd


def _parse_channel_command(cmd):
    if not cmd or not cmd.startswith("ch"):
        return None
    rest = cmd[2:]
    if "_pulse_" in rest:
        parts = rest.split("_pulse_", 1)
        if len(parts) != 2:
            return None
        try:
            channel = int(parts[0])
            pulse_ms = int(parts[1])
        except ValueError:
            return None
        if channel not in CH_PINS:
            return None
        if pulse_ms < 50:
            pulse_ms = 50
        if pulse_ms > 5000:
            pulse_ms = 5000
        return channel, True, pulse_ms
    if rest.endswith("_on"):
        on = True
        ch_str = rest[:-3]
    elif rest.endswith("_off"):
        on = False
        ch_str = rest[:-4]
    else:
        return None
    try:
        channel = int(ch_str)
    except ValueError:
        return None
    if channel not in CH_PINS:
        return None
    return channel, on, None


def apply_command(cmd):
    parsed = _parse_channel_command(cmd)
    if parsed:
        channel, on, pulse_ms = parsed
        if pulse_ms is not None:
            CH_PINS[channel].value(1)
            ch_states[str(channel)] = "on"
            log("EXEC CH{} PULSE {}ms".format(channel, pulse_ms))
            time.sleep_ms(pulse_ms)
            CH_PINS[channel].value(0)
            ch_states[str(channel)] = "off"
            log("EXEC CH{} PULSE OFF".format(channel))
        else:
            CH_PINS[channel].value(1 if on else 0)
            ch_states[str(channel)] = "on" if on else "off"
            log("EXEC CH{} {}".format(channel, "ON" if on else "OFF"))
        send_heartbeat()
    elif cmd:
        log("unknown command: {}".format(cmd))


def main():
    log("remote_test_poll.py — main.py の使用を推奨")
    if REMOTE_TEST_TOKEN == "CHANGE_ME_SAME_AS_SERVER_ENV":
        log("ERROR: REMOTE_TEST_TOKEN を設定してください")
        return

    poll_interval_sec = int(POLL_INTERVAL_SEC)
    heartbeat_interval_sec = max(int(HEARTBEAT_INTERVAL_SEC), poll_interval_sec)
    heartbeat_interval_ms = heartbeat_interval_sec * 1000
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

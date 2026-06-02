#!/usr/bin/env python3
"""Interactive DI simulator — publishes RP2350 MQTT events."""

import json
import sys
import time
from pathlib import Path

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("pip install paho-mqtt")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "firmware"))

import config_loader
from relay_manager import RelayManager
from safety_manager import SafetyManager

MQTT_CFG = json.loads((ROOT / "config" / "mqtt.json").read_text(encoding="utf-8"))
TOPICS = MQTT_CFG.get("topics", {})
BROKER = MQTT_CFG.get("broker_host", "192.168.1.10")
DEVICE_ID = MQTT_CFG.get("device_id", "rp2350-home-01")

config_loader.load_sensor_map = lambda: json.loads(
    (ROOT / "config" / "sensor_map.json").read_text(encoding="utf-8")
)

MENU = """
=== TiSLY RP2350 DI Simulator ===
 1  赤外線① ON    2  赤外線② ON
 3  人感① ON      4  人感② ON
 5  窓① ON        6  窓② ON
 7  非常停止 ON   8  予備 ON
 c  アラーム解除   s  state再送   q  終了
"""


class FakeBoard:
    def __init__(self):
        self._ro = [0] * 8
        self._di = [0] * 8

    def di_count(self):
        return 8

    def ro_count(self):
        return 8

    def read_di(self, i):
        return self._di[i]

    def set_relay(self, i, on):
        self._ro[i] = 1 if on else 0

    def relay_state(self, i):
        return self._ro[i]

    def all_relays_on(self):
        self._ro = [1] * 8

    def all_relays_off(self):
        self._ro = [0] * 8

    def set_di(self, i, v):
        self._di[i] = 1 if v else 0


def publish_all(client, board, safety):
    body = {
        "device_id": DEVICE_ID,
        "di": [board.read_di(i) for i in range(8)],
        "relay": [board.relay_state(i) for i in range(8)],
        "alarm_mode": safety.alarm_mode,
        "ts": time.time(),
    }
    client.publish(TOPICS["state"], json.dumps(body), qos=1, retain=True)


def trigger(client, board, safety, events, di_index, active=True):
    board.set_di(di_index, 1 if active else 0)
    if active:
        evs = safety.on_di_active(di_index)
        for ev in evs:
            client.publish(TOPICS["event"], json.dumps(ev, ensure_ascii=False), qos=1)
        if safety.alarm_mode:
            client.publish(
                TOPICS["alarm"],
                json.dumps({"active": 1, "alarm_mode": True, "device_id": DEVICE_ID, "ts": time.time()}),
                qos=1,
                retain=True,
            )
        elif any(e.get("alarm") for e in evs):
            client.publish(
                TOPICS["alarm"],
                json.dumps({"active": 1, "alarm_mode": False, "device_id": DEVICE_ID, "ts": time.time()}),
                qos=1,
                retain=True,
            )
    else:
        for ev in safety.on_di_inactive(di_index):
            client.publish(TOPICS["event"], json.dumps(ev, ensure_ascii=False), qos=1)
    publish_all(client, board, safety)


def main():
    host = sys.argv[1] if len(sys.argv) > 1 else BROKER
    board = FakeBoard()
    relays = RelayManager(board)
    safety = SafetyManager(relays)
    events = None

    client = mqtt.Client(client_id="tisly-rp2350-sim-inputs")
    client.connect(host, MQTT_CFG.get("broker_port", 1883), 60)
    publish_all(client, board, safety)

    print(MENU)
    while True:
        try:
            cmd = input("> ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            break
        if cmd in ("q", "quit", "exit"):
            break
        if cmd == "c":
            ev = safety.clear_alarm()
            client.publish(
                TOPICS["alarm"],
                json.dumps({"active": 0, "alarm_mode": False, "device_id": DEVICE_ID}),
                retain=True,
            )
            client.publish(TOPICS["event"], json.dumps(ev, ensure_ascii=False))
            publish_all(client, board, safety)
            continue
        if cmd == "s":
            publish_all(client, board, safety)
            client.publish(
                TOPICS["heartbeat"],
                json.dumps({"uptime": 0, "device_id": DEVICE_ID, "ts": time.time()}),
            )
            continue
        if cmd.isdigit() and 1 <= int(cmd) <= 8:
            trigger(client, board, safety, events, int(cmd) - 1, True)
            continue
        print("不明なコマンド")

    client.disconnect()


if __name__ == "__main__":
    main()

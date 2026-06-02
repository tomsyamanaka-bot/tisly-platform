#!/usr/bin/env python3
"""MQTT simulator — publish RP2350 topics without hardware."""

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
MQTT_CFG = json.loads((ROOT / "config" / "mqtt.json").read_text(encoding="utf-8"))
BROKER = MQTT_CFG.get("broker_host", "192.168.1.10")
TOPICS = MQTT_CFG.get("topics", {})
DEVICE_ID = MQTT_CFG.get("device_id", "rp2350-home-01")


def pub(client, topic, payload, retain=False, qos=1):
    client.publish(topic, payload, qos=qos, retain=retain)
    print(topic, "=", payload)


def main():
    host = sys.argv[1] if len(sys.argv) > 1 else BROKER
    c = mqtt.Client(client_id="tisly-rp2350-sim", protocol=mqtt.MQTTv311)
    c.connect(host, MQTT_CFG.get("broker_port", 1883), 60)

    state = {
        "device_id": DEVICE_ID,
        "di": [0] * 8,
        "relay": [0] * 8,
        "alarm_mode": False,
        "ts": time.time(),
    }

    pub(c, TOPICS["state"], json.dumps(state), retain=True)

    # 赤外線 DI1
    state["di"][0] = 1
    state["relay"][0] = 1
    pub(c, TOPICS["state"], json.dumps(state), retain=True)
    pub(
        c,
        TOPICS["event"],
        json.dumps(
            {
                "type": "ir_beam",
                "di": 1,
                "name": "赤外線ビーム①",
                "message": "sim: 100Vライト① ON",
                "device_id": DEVICE_ID,
            },
            ensure_ascii=False,
        ),
    )
    pub(c, TOPICS["relay_set"].replace("{n}", "1"), "1", retain=True)

    pub(c, TOPICS["heartbeat"], json.dumps({"uptime": 0, "device_id": DEVICE_ID, "ts": time.time()}))
    pub(c, TOPICS["alarm"], json.dumps({"active": 0, "alarm_mode": False, "device_id": DEVICE_ID}), retain=True)

    time.sleep(0.5)
    state["di"][0] = 0
    state["relay"][0] = 0
    pub(c, TOPICS["state"], json.dumps(state), retain=True)
    pub(c, TOPICS["relay_set"].replace("{n}", "1"), "0", retain=True)

    c.disconnect()
    print("done — check Node-RED (tisly_rp2350_v1) / Web UI")


if __name__ == "__main__":
    main()

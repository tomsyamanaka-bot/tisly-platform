"""TiSLY production firmware for Waveshare RP2350-POE-ETH-8DI-8RO."""

import json
import time
from machine import Pin

from network_manager import NetworkManager
from pulse_counter import PulseCounter


def load_config():
    with open("config.json", "r") as source:
        return json.load(source)


CONFIG = load_config()
INPUT_CONFIG = [
    item for item in CONFIG.get("digital_inputs", []) if item.get("enabled")
]
OUTPUT_CONFIG = [
    item for item in CONFIG.get("relay_outputs", []) if item.get("enabled")
]

INPUT_PINS = {}
for item in INPUT_CONFIG:
    pull = Pin.PULL_UP if item.get("active_low", True) else Pin.PULL_DOWN
    INPUT_PINS[str(item["port"])] = Pin(int(item["gpio"]), Pin.IN, pull)

OUTPUT_PINS = {}
for item in OUTPUT_CONFIG:
    port = str(item["port"])
    pin = Pin(int(item["gpio"]), Pin.OUT)
    off_value = 1 if item.get("active_low", False) else 0
    pin.value(off_value)
    OUTPUT_PINS[port] = (pin, bool(item.get("active_low", False)))

COUNTER = PulseCounter(
    INPUT_CONFIG,
    CONFIG.get("debounce_ms", 50),
    CONFIG.get("flash_save_interval_ms", 5000),
)
NETWORK = NetworkManager(CONFIG)
RELAY_STATES = {str(port): "off" for port in range(1, 9)}


def input_active(item):
    raw = INPUT_PINS[str(item["port"])].value()
    return raw == 0 if item.get("active_low", True) else raw == 1


def input_states():
    states = {str(port): "off" for port in range(1, 9)}
    for item in INPUT_CONFIG:
        states[str(item["port"])] = "on" if input_active(item) else "off"
    return states


def telemetry_payload(reason):
    return {
        "deviceId": CONFIG["device_id"],
        "propertyId": CONFIG.get("property_id"),
        "firmwareVersion": "2.0.0-rp2350-production",
        "reason": reason,
        "debounceMs": max(50, int(CONFIG.get("debounce_ms", 50))),
        "inputStates": input_states(),
        "relayStates": dict(RELAY_STATES),
        "pulseCounts": dict(COUNTER.counts),
        "meterValues": COUNTER.meter_values(),
    }


def send_telemetry(reason):
    path = CONFIG.get(
        "telemetry_path",
        "/api/device/ports/telemetry",
    )
    NETWORK.request_json("POST", path, telemetry_payload(reason))


def send_emergency(edge):
    payload = telemetry_payload("emergency")
    payload["emergency"] = {
        "port": edge["port"],
        "active": edge["active"],
        "label": next(
            (
                item.get("label", "")
                for item in INPUT_CONFIG
                if int(item["port"]) == edge["port"]
            ),
            "",
        ),
    }
    path = CONFIG.get(
        "emergency_path",
        "/api/device/ports/emergency",
    )
    NETWORK.request_json("POST", path, payload)


def set_relay(port, on):
    key = str(port)
    output = OUTPUT_PINS.get(key)
    if output is None:
        return False
    pin, active_low = output
    pin.value(0 if on and active_low else 1 if on else 1 if active_low else 0)
    RELAY_STATES[key] = "on" if on else "off"
    return True


def poll_command():
    path = CONFIG.get(
        "command_path",
        "/api/device/ports/command",
    )
    separator = "&" if "?" in path else "?"
    body = NETWORK.request_json(
        "GET",
        path + separator + "deviceId=" + CONFIG["device_id"],
    )
    command = body.get("command")
    if command and set_relay(int(command["portNumber"]), bool(command["on"])):
        send_telemetry("relay_command")


def run():
    print("[tisly] starting", CONFIG["device_id"])
    print("[tisly] ethernet", NETWORK.connect())
    poll_ms = max(1000, int(CONFIG.get("poll_interval_ms", 3000)))
    telemetry_ms = max(
        poll_ms,
        int(CONFIG.get("telemetry_interval_ms", 60000)),
    )
    next_poll = time.ticks_ms()
    next_telemetry = time.ticks_ms()

    while True:
        now = time.ticks_ms()
        event_pending = False
        for item in INPUT_CONFIG:
            edge = COUNTER.sample(item["port"], input_active(item))
            if edge is None:
                continue
            event_pending = True
            if edge["emergency"]:
                COUNTER.save(force=True)
                try:
                    send_emergency(edge)
                except Exception as exc:
                    print("[tisly] emergency retry:", exc)

        if event_pending:
            try:
                send_telemetry("input_event")
            except Exception as exc:
                print("[tisly] telemetry:", exc)

        COUNTER.save()
        if time.ticks_diff(now, next_poll) >= 0:
            try:
                poll_command()
            except Exception as exc:
                print("[tisly] command:", exc)
            next_poll = time.ticks_add(now, poll_ms)

        if time.ticks_diff(now, next_telemetry) >= 0:
            try:
                send_telemetry("periodic")
            except Exception as exc:
                print("[tisly] periodic:", exc)
            next_telemetry = time.ticks_add(now, telemetry_ms)
        time.sleep_ms(10)


try:
    run()
finally:
    COUNTER.save(force=True)

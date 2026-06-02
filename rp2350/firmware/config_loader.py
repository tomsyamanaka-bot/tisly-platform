"""Load JSON config from on-device /config (RP2350 Edition)."""

import json

_CONFIG_DIR = "config"

_DEFAULT_DEVICE = {
    "debounce_ms": 50,
    "heartbeat_interval_sec": 30,
    "active_low": True,
    "device_id": "rp2350-home-01",
}

_DEFAULT_MQTT = {
    "broker_host": "192.168.1.10",
    "broker_port": 1883,
    "client_id": "tisly-rp2350-home-01",
    "device_id": "rp2350-home-01",
    "topic_prefix": "tisly/rp2350/rp2350-home-01",
    "qos": 1,
}


def _load(path, default):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except OSError:
        return default


def load_device():
    return _load(_CONFIG_DIR + "/device.json", _DEFAULT_DEVICE)


def load_mqtt():
    return _load(_CONFIG_DIR + "/mqtt.json", _DEFAULT_MQTT)


def load_network():
    return _load(_CONFIG_DIR + "/network.json", {"dhcp": True})


def load_gpio():
    return _load(_CONFIG_DIR + "/gpio_map.json", {})


def load_relay_map():
    return _load(_CONFIG_DIR + "/relay_map.json", {"relays": {}})


def load_sensor_map():
    return _load(_CONFIG_DIR + "/sensor_map.json", {"inputs": {}})


def gpio_pin_lists(gpio_map):
    """Extract ordered pin number lists from gpio_map (null pins skipped)."""
    di_pins = []
    ro_pins = []
    di_section = gpio_map.get("digital_inputs", {})
    ro_section = gpio_map.get("relay_outputs", {})

    if isinstance(di_section, list):
        di_pins = [p for p in di_section if p is not None]
    elif isinstance(di_section, dict):
        for key in sorted(di_section.keys(), key=lambda k: int(k.replace("DI", "") or 0)):
            entry = di_section[key]
            pin = entry.get("gpio_pin") if isinstance(entry, dict) else entry
            if pin is not None:
                di_pins.append(pin)

    if isinstance(ro_section, list):
        ro_pins = [p for p in ro_section if p is not None]
    elif isinstance(ro_section, dict):
        for key in sorted(ro_section.keys(), key=lambda k: int(k.replace("RO", "") or 0)):
            entry = ro_section[key]
            pin = entry.get("gpio_pin") if isinstance(entry, dict) else entry
            if pin is not None:
                ro_pins.append(pin)

    buzzer = gpio_map.get("onboard_buzzer")
    if isinstance(buzzer, dict):
        buzzer = buzzer.get("gpio_pin")

    return di_pins, ro_pins, buzzer

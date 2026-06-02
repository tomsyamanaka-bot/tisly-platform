#!/usr/bin/env python3
"""Host-side logic test (no hardware, no MQTT)."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "firmware"))

import config_loader

config_loader.load_sensor_map = lambda: json.loads(
    (ROOT / "config" / "sensor_map.json").read_text(encoding="utf-8")
)

from tisly_logic import SecurityEngine


class FakeBoard:
    def __init__(self):
        self.relays = [0] * 8

    def di_count(self):
        return 8

    def ro_count(self):
        return 8

    def set_relay(self, i, on):
        self.relays[i] = 1 if on else 0

    def relay_state(self, i):
        return self.relays[i]

    def all_relays_on(self):
        self.relays = [1] * 8

    def all_relays_off(self):
        self.relays = [0] * 8


def main():
    b = FakeBoard()
    e = SecurityEngine(b)
    e.on_di_active(0)
    assert b.relays[0] == 1, "IR1 -> RO1"
    e.on_di_active(2)
    assert b.relays[2] == 0, "PIR -> no relay"
    e.on_di_active(4)
    assert b.relays[2] == 1 and b.relays[3] == 1, "window -> RO3/RO4"
    e.on_di_active(6)
    assert all(b.relays), "emergency all on"
    assert e.alarm_mode
    e.clear_alarm()
    assert not any(b.relays), "clear"
    print("OK - test_logic_host passed")


if __name__ == "__main__":
    main()

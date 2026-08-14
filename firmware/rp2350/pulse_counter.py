"""Debounced DI sampling and wear-conscious Flash persistence."""

import json
import os
import time


class PulseCounter:
    def __init__(self, inputs, debounce_ms=50, save_interval_ms=5000):
        self.inputs = {str(item["port"]): item for item in inputs}
        self.debounce_ms = max(50, int(debounce_ms))
        self.save_interval_ms = max(1000, int(save_interval_ms))
        self.path = "pulse_counts.json"
        self.temp_path = "pulse_counts.tmp"
        self.counts = {key: 0 for key in self.inputs}
        self.stable = {key: False for key in self.inputs}
        self.candidate = dict(self.stable)
        self.changed_at = {key: time.ticks_ms() for key in self.inputs}
        self.dirty = False
        self.last_save_ms = time.ticks_ms()
        self._load()

    def _load(self):
        try:
            with open(self.path, "r") as source:
                saved = json.load(source)
            for key in self.counts:
                self.counts[key] = max(0, int(saved.get(key, 0)))
        except (OSError, ValueError, TypeError):
            pass

    def save(self, force=False):
        now = time.ticks_ms()
        due = time.ticks_diff(now, self.last_save_ms) >= self.save_interval_ms
        if not self.dirty or (not force and not due):
            return
        with open(self.temp_path, "w") as target:
            json.dump(self.counts, target)
            target.flush()
        try:
            os.remove(self.path)
        except OSError:
            pass
        os.rename(self.temp_path, self.path)
        self.dirty = False
        self.last_save_ms = now

    def sample(self, port, active):
        """Return a stable edge after at least 50 ms."""
        key = str(port)
        now = time.ticks_ms()
        active = bool(active)
        if active != self.candidate[key]:
            self.candidate[key] = active
            self.changed_at[key] = now
            return None
        if active == self.stable[key]:
            return None
        if time.ticks_diff(now, self.changed_at[key]) < self.debounce_ms:
            return None

        previous = self.stable[key]
        self.stable[key] = active
        item = self.inputs[key]
        if active and not previous and item.get("mode") == "pulse":
            self.counts[key] += 1
            self.dirty = True
        return {
            "port": int(port),
            "active": active,
            "pulse_count": self.counts[key],
            "emergency": bool(item.get("emergency") and active),
        }

    def meter_values(self):
        values = {}
        for key, item in self.inputs.items():
            initial = float(item.get("initial_meter_value", 0))
            weight = float(item.get("pulse_weight", 1))
            values[key] = initial + self.counts[key] * weight
        return values

"""Security rules: DI → RO / alarm / events (sensor_map.json)."""

from config_loader import load_sensor_map


class SafetyManager:
    """
    DI index is 0-based (DI1 -> 0).
    Relay index is 0-based (RO1 -> 0).
    """

    def __init__(self, relay_manager):
        self._relays = relay_manager
        self.alarm_mode = False
        self._inputs = load_sensor_map().get("inputs", {})

    def on_di_active(self, di_index):
        ch = str(di_index + 1)
        meta = self._inputs.get(ch, {})
        role = meta.get("role", "")
        events = []

        if role == "emergency" or "alarm_mode" in meta.get("actions", []):
            self.alarm_mode = True
            self._relays.all_on()
            events.append(
                {
                    "type": "emergency",
                    "di": di_index + 1,
                    "name": meta.get("name", ""),
                    "message": "非常停止 — 全RO ON・アラームモード",
                    "alarm_mode": True,
                }
            )
            return events

        if self.alarm_mode:
            events.append(
                {
                    "type": "sensor",
                    "di": di_index + 1,
                    "name": meta.get("name", ""),
                    "message": "アラーム中のセンサー検知",
                }
            )

        if role == "ir_beam_1":
            self._relays.set(0, True)
            events.append(self._evt("ir_beam", di_index, meta, "100Vライト① ON"))
        elif role == "ir_beam_2":
            self._relays.set(1, True)
            events.append(self._evt("ir_beam", di_index, meta, "100Vライト② ON"))
        elif role in ("window_1", "window_2"):
            self._relays.set(2, True)
            self._relays.set(3, True)
            events.append(
                self._evt("window_alarm", di_index, meta, "窓検知 — パトライト・ブザー ON", alarm=True)
            )
        elif role in ("pir_1", "pir_2"):
            events.append(self._evt("pir", di_index, meta, "人感検知"))
        elif role == "spare":
            events.append(self._evt("spare", di_index, meta, "予備入力"))

        return events

    def on_di_inactive(self, di_index):
        if self.alarm_mode:
            return []
        ch = str(di_index + 1)
        meta = self._inputs.get(ch, {})
        role = meta.get("role", "")
        events = []

        if role == "ir_beam_1":
            self._relays.set(0, False)
            events.append(self._evt("ir_beam_clear", di_index, meta, "100Vライト① OFF"))
        elif role == "ir_beam_2":
            self._relays.set(1, False)
            events.append(self._evt("ir_beam_clear", di_index, meta, "100Vライト② OFF"))
        elif role in ("window_1", "window_2"):
            self._relays.set(2, False)
            self._relays.set(3, False)
            events.append(self._evt("window_clear", di_index, meta, "パトライト・ブザー OFF"))

        return events

    def clear_alarm(self):
        self.alarm_mode = False
        self._relays.all_off()
        return {"type": "alarm_clear", "message": "アラーム解除", "alarm_mode": False}

    def _evt(self, kind, di_index, meta, message, alarm=False):
        ev = {
            "type": kind,
            "di": di_index + 1,
            "name": meta.get("name", ""),
            "message": message,
        }
        if alarm:
            ev["alarm"] = True
        return ev

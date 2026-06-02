"""Event publishing to MQTT."""


class EventManager:
    def __init__(self, mqtt_publish_event=None):
        self._publish = mqtt_publish_event

    def emit(self, event_dict):
        if self._publish:
            self._publish(event_dict)
        return event_dict

    def emit_many(self, events):
        for ev in events:
            self.emit(ev)

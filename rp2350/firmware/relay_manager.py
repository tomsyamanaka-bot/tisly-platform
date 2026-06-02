"""Relay output control and MQTT sync."""


class RelayManager:
    def __init__(self, board, mqtt_publish_relay=None, mqtt_publish_state=None):
        self._board = board
        self._publish_relay = mqtt_publish_relay
        self._publish_state = mqtt_publish_state

    def set(self, index, on):
        self._board.set_relay(index, on)
        if self._publish_relay:
            self._publish_relay(index + 1, on)

    def all_on(self):
        for i in range(self._board.ro_count()):
            self.set(i, True)

    def all_off(self):
        for i in range(self._board.ro_count()):
            self.set(i, False)

    def states(self):
        return [self._board.relay_state(i) for i in range(self._board.ro_count())]

    def sync_mqtt(self, di_states, alarm_mode=False):
        if self._publish_state:
            self._publish_state(di_states, self.states(), alarm_mode)

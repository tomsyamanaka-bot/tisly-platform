"""Host-test compatibility wrapper around SafetyManager."""

from relay_manager import RelayManager
from safety_manager import SafetyManager


class SecurityEngine:
    """Legacy API: SecurityEngine(board) for test_logic_host.py."""

    def __init__(self, board):
        self._relays = RelayManager(board)
        self._inner = SafetyManager(self._relays)

    @property
    def alarm_mode(self):
        return self._inner.alarm_mode

    @alarm_mode.setter
    def alarm_mode(self, value):
        self._inner.alarm_mode = value

    def on_di_active(self, di_index):
        return self._inner.on_di_active(di_index)

    def on_di_inactive(self, di_index):
        return self._inner.on_di_inactive(di_index)

    def clear_alarm(self):
        return self._inner.clear_alarm()


__all__ = ["SecurityEngine"]

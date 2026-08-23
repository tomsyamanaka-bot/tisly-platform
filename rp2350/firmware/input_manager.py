"""Debounced digital input polling (50ms default)."""

# センサー確定用の推奨値（security_light の 250ms 継続 ON と併用）
DEFAULT_DI_CONFIRM_MS = 250


class InputManager:
    def __init__(self, board, debounce_ms=50):
        self._board = board
        self._debounce_ms = debounce_ms
        n = board.di_count()
        self._stable = [0] * n
        self._pending = [0] * n
        self._last_change = [0] * n

    def seed_from_hardware(self):
        import time

        now = time.ticks_ms()
        for i in range(self._board.di_count()):
            v = self._board.read_di(i)
            self._stable[i] = v
            self._pending[i] = v
            self._last_change[i] = now

    def stable_states(self):
        return list(self._stable)

    def poll(self):
        import time

        now = time.ticks_ms()
        edges = []
        for i in range(self._board.di_count()):
            raw = self._board.read_di(i)
            if raw != self._pending[i]:
                self._pending[i] = raw
                self._last_change[i] = now
            elif time.ticks_diff(now, self._last_change[i]) >= self._debounce_ms:
                if raw != self._stable[i]:
                    prev = self._stable[i]
                    self._stable[i] = raw
                    edges.append((i, prev, raw))
        return edges

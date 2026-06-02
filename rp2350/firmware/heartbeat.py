"""Periodic heartbeat publisher (default 30s)."""

import time


class Heartbeat:
    def __init__(self, interval_sec, publish_fn, boot_time=None):
        self._interval = interval_sec
        self._publish = publish_fn
        self._boot = boot_time if boot_time is not None else time.time()
        self._last = 0

    def tick(self, ip=None):
        now = time.time()
        if now - self._last >= self._interval:
            uptime = int(now - self._boot)
            if self._publish:
                self._publish(uptime, ip)
            self._last = now
            return True
        return False

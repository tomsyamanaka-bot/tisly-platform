"""豊島邸のDO1/DO2がスライダー秒で終わることのホストテスト。"""

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware"))

import toyoshima_security as ts

FLASH_MS = 15_000


class VirtualClock:
    """sleep_ms を壁時計にせず、期限ちょうどまで進める。"""

    def __init__(self):
        self.ms = 0
        self.waiters = []

    def mono(self):
        return self.ms

    def diff(self, later, earlier):
        return int(later) - int(earlier)

    async def sleep_ms(self, ms):
        wake = self.ms + max(0, int(ms))
        fut = asyncio.get_running_loop().create_future()
        self.waiters.append((wake, fut))
        self.waiters.sort(key=lambda item: item[0])
        await fut

    def pump(self):
        if not self.waiters:
            return False
        wake, fut = self.waiters.pop(0)
        self.ms = wake
        if not fut.done():
            fut.set_result(None)
        return True


def first_off(events, ch):
    seen = False
    for stamp, channel, on in events:
        if channel != ch:
            continue
        if on:
            seen = True
        elif seen:
            return stamp
    return None


def last_on(events, ch):
    last = None
    for stamp, channel, on in events:
        if channel == ch and on:
            last = stamp
    return last


def turned_on(events, ch):
    return any(channel == ch and on for _stamp, channel, on in events)


def on_after(events, ch, stamp):
    return any(
        channel == ch and on and t >= stamp
        for t, channel, on in events
    )


async def settle(clock, done):
    for _ in range(40000):
        await asyncio.sleep(0)
        clock.pump()
        if not done():
            continue
        await asyncio.sleep(0)
        if done() and not clock.waiters:
            return
    raise AssertionError(
        "timeout ms=%s waiters=%s" % (clock.ms, len(clock.waiters))
    )


def bind(clock, events, outputs):
    def set_ch(ch, on):
        outputs[ch] = bool(on)
        events.append((clock.ms, int(ch), bool(on)))

    return set_ch


def use_clock(clock):
    saved = (ts._mono_ms, ts._mono_diff, ts.asyncio.sleep_ms)
    ts._mono_ms = clock.mono
    ts._mono_diff = clock.diff
    ts.asyncio.sleep_ms = clock.sleep_ms
    return saved


def restore_clock(saved):
    ts._mono_ms, ts._mono_diff, ts.asyncio.sleep_ms = saved


def base_rules(mode, sec, legacy_ms=None):
    rules = {
        "security_mode": mode,
        "guardMode": "always",
        "force_relay_test": True,
        "flash_enabled": True,
        "light_duration_sec": sec,
        "flash_duration_sec": 15,
    }
    if legacy_ms is not None:
        rules["di1DurationMs"] = legacy_ms
    return rules


def assert_case(events, outputs, duration, kind):
    if kind == "silent":
        assert not turned_on(events, 1)
        assert not turned_on(events, 2)
        assert not turned_on(events, 3)
        assert outputs.get(1) is not True
        assert outputs.get(2) is not True
        assert outputs.get(3) is not True
        return
    assert outputs.get(1) is False
    assert outputs.get(2) is not True
    assert outputs.get(3) is not True
    if kind == "far-steady":
        assert first_off(events, 1) == duration
        assert not turned_on(events, 2)
        assert not turned_on(events, 3)
        return
    if kind == "both-steady":
        assert first_off(events, 1) == duration
        assert first_off(events, 2) == duration
        assert not turned_on(events, 3)
        return
    if kind == "both-steady-flash":
        assert first_off(events, 1) == duration
        assert first_off(events, 2) == duration
        assert first_off(events, 3) == FLASH_MS
        assert FLASH_MS != duration
        return
    period = ts.PATLITE_BLINK_MS
    if kind == "far-blink":
        assert duration - (period * 2) <= last_on(events, 1) < duration
        assert not on_after(events, 1, duration)
        assert not turned_on(events, 2)
        assert not turned_on(events, 3)
        return
    if kind == "near-blink":
        for ch in (1, 2):
            assert duration - (period * 2) <= last_on(events, ch) < duration
            assert not on_after(events, ch, duration)
        assert FLASH_MS - (period * 2) <= last_on(events, 3) < FLASH_MS
        if FLASH_MS > duration:
            assert last_on(events, 3) > duration
        else:
            assert last_on(events, 1) >= FLASH_MS
        return
    raise AssertionError(kind)


def run_case(mode, sec, di, staged, kind):
    clock = VirtualClock()
    events = []
    outputs = {}
    ctrl = ts.ToyoshimaMainHouseController(bind(clock, events, outputs))
    ctrl.apply_rules(base_rules(mode, sec, legacy_ms=30000))
    assert ctrl._output_ms == sec * 1000
    assert ctrl._flash_ms == FLASH_MS
    duration = sec * 1000

    async def drive():
        if staged:
            ctrl.note_perimeter_edge(1)
        ctrl.on_di_edge(di, "off", "on")

        def done():
            if kind == "silent":
                return not clock.waiters
            lights_off = (
                outputs.get(1) is False and outputs.get(2) is not True
            )
            return lights_off and clock.ms >= duration and not clock.waiters

        await settle(clock, done)

    saved = use_clock(clock)
    try:
        asyncio.run(drive())
    finally:
        restore_clock(saved)
    assert_case(events, outputs, duration, kind)


def test_slider_beats_legacy_thirty_seconds():
    ctrl = ts.ToyoshimaMainHouseController(lambda _ch, _on: None)
    ctrl.apply_rules({
        "light_duration_sec": 5,
        "di1DurationMs": 30000,
        "flash_duration_sec": 15,
    })
    assert ctrl._output_ms == 5000
    assert ctrl._flash_ms == FLASH_MS
    ctrl.apply_rules({"di1DurationMs": 30000})
    assert ctrl._output_ms == 30000


def test_modes_end_at_five_and_thirty_seconds():
    cases = (
        ("2STEP", 1, False, "far-steady"),
        ("2STEP", 2, True, "both-steady-flash"),
        ("2STEP", 2, False, "both-steady"),
        ("DIRECT", 1, False, "both-steady-flash"),
        ("DIRECT", 2, True, "both-steady-flash"),
        ("DIRECT", 2, False, "both-steady"),
        ("two_stage_blink", 1, False, "far-blink"),
        ("two_stage_blink", 2, True, "near-blink"),
        ("two_stage_blink", 2, False, "both-steady"),
        ("SILENT", 1, False, "silent"),
        ("SILENT", 2, True, "silent"),
    )
    for sec in (5, 30):
        for mode, di, staged, kind in cases:
            run_case(mode, sec, di, staged, kind)


def test_blink_command_cuts_a_stale_thirty_second_window():
    clock = VirtualClock()
    events = []
    outputs = {}
    ctrl = ts.ToyoshimaMainHouseController(bind(clock, events, outputs))
    ctrl.apply_rules({
        "security_mode": "two_stage_blink",
        "guardMode": "always",
        "force_relay_test": True,
        "flash_enabled": False,
        "di1DurationMs": 30000,
    })
    assert ctrl._output_ms == 30000

    async def drive():
        ctrl.on_di_edge(2, "off", "on")
        await ctrl.execute_manual_command("sensor_near", 5000)

        def done():
            return (
                outputs.get(1) is False
                and outputs.get(2) is not True
                and clock.ms >= 5000
                and not clock.waiters
            )

        await settle(clock, done)

    saved = use_clock(clock)
    try:
        asyncio.run(drive())
    finally:
        restore_clock(saved)
    assert first_off(events, 1) == 5000
    assert first_off(events, 2) == 5000
    assert not on_after(events, 1, 5001)
    assert not on_after(events, 2, 5001)
    assert outputs.get(1) is False
    assert outputs.get(2) is False


if __name__ == "__main__":
    test_slider_beats_legacy_thirty_seconds()
    test_modes_end_at_five_and_thirty_seconds()
    test_blink_command_cuts_a_stale_thirty_second_window()
    print("toyoshima light duration ok")

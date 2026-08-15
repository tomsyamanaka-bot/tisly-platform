"""TiSLY firmware for Waveshare RP2350-POE-ETH-8DI-8RO."""

import json
import os
import time
import micropython
from machine import Pin, SPI, disable_irq, enable_irq

try:
    import urequests
except ImportError:
    urequests = None

try:
    import neopixel
except ImportError:
    neopixel = None


DI_GPIO = (9, 10, 11, 12, 13, 14, 15, 16)
W5500_DEFAULTS = {
    "spi_id": 0,
    "sck": 34,
    "mosi": 35,
    "miso": 36,
    "cs": 33,
    "reset": 25,
    "interrupt": 32,
}
RGB_LED_GPIO = 2
DEBOUNCE_MS = 50
HEARTBEAT_MS = 60000
QUEUE_RETRY_MS = 15000
DHCP_TIMEOUT_MS = 30000
RETRY_DELAYS_MS = (0, 1000, 3000)
QUEUE_FILE = "pending_posts.json"
QUEUE_TEMP_FILE = "pending_posts.tmp"


def load_config():
    with open("config.json", "r") as source:
        return json.load(source)


CONFIG = load_config()
DEVICE_ID = str(CONFIG.get("device_id", "TISLY-BOX-001"))
API_ENDPOINT = str(
    CONFIG.get(
        "api_endpoint",
        "https://tisly.jp/api/meter/telemetry",
    )
)
DEVICE_TOKEN = str(CONFIG.get("device_token", ""))
DEBOUNCE_MS = max(50, int(CONFIG.get("debounce_ms", DEBOUNCE_MS)))
HEARTBEAT_MS = max(
    60000,
    int(
        CONFIG.get(
            "heartbeat_interval_ms",
            CONFIG.get("telemetry_interval_ms", HEARTBEAT_MS),
        )
    ),
)

INPUTS = [Pin(gpio, Pin.IN, Pin.PULL_UP) for gpio in DI_GPIO]
LAST_STABLE = [pin.value() for pin in INPUTS]
PENDING_PULSES = 0
LAST_DI1_IRQ_AT = -DEBOUNCE_MS
DI2_PENDING = False
DI2_IRQ_AT = 0
PULSE_COUNT = 0
NIC = None
W5500_INTERRUPT = None

micropython.alloc_emergency_exception_buf(128)


def load_queue():
    try:
        with open(QUEUE_FILE, "r") as source:
            queued = json.load(source)
            return queued if isinstance(queued, list) else []
    except (OSError, ValueError):
        return []


POST_QUEUE = load_queue()


def save_queue():
    with open(QUEUE_TEMP_FILE, "w") as target:
        json.dump(POST_QUEUE, target)
    try:
        os.remove(QUEUE_FILE)
    except OSError:
        pass
    os.rename(QUEUE_TEMP_FILE, QUEUE_FILE)


def set_rgb(red, green, blue):
    if neopixel is None:
        return
    try:
        pixel = neopixel.NeoPixel(Pin(RGB_LED_GPIO), 1)
        pixel[0] = (red, green, blue)
        pixel.write()
    except Exception:
        pass


def blink_success():
    set_rgb(0, 24, 0)
    time.sleep_ms(80)
    set_rgb(0, 0, 0)


def reset_w5500(reset_pin):
    reset_pin.value(1)
    time.sleep_ms(10)
    reset_pin.value(0)
    time.sleep_ms(2)
    reset_pin.value(1)
    time.sleep_ms(160)


def wait_for_dhcp(nic, timeout_ms=DHCP_TIMEOUT_MS):
    deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
    while time.ticks_diff(deadline, time.ticks_ms()) > 0:
        if nic.isconnected():
            network_info = nic.ifconfig()
            if network_info and network_info[0] != "0.0.0.0":
                return network_info
        time.sleep_ms(250)
    raise OSError("Ethernet DHCP timeout")


def configure_dhcp(nic):
    nic.active(True)
    try:
        nic.ifconfig("dhcp")
    except (TypeError, ValueError):
        pass
    return wait_for_dhcp(nic)


def init_ethernet():
    global NIC, W5500_INTERRUPT
    import network

    ethernet = dict(W5500_DEFAULTS)
    ethernet.update(CONFIG.get("ethernet", {}))
    reset_pin = Pin(int(ethernet["reset"]), Pin.OUT, value=1)
    W5500_INTERRUPT = Pin(
        int(ethernet["interrupt"]),
        Pin.IN,
        Pin.PULL_UP,
    )
    reset_w5500(reset_pin)
    errors = []

    try:
        spi = SPI(
            int(ethernet["spi_id"]),
            baudrate=int(ethernet.get("baudrate", 20_000_000)),
            polarity=0,
            phase=0,
            sck=Pin(int(ethernet["sck"])),
            mosi=Pin(int(ethernet["mosi"])),
            miso=Pin(int(ethernet["miso"])),
        )
        nic = network.WIZNET5K(
            spi,
            Pin(int(ethernet["cs"]), Pin.OUT, value=1),
            reset_pin,
        )
        network_info = configure_dhcp(nic)
        NIC = nic
        return network_info
    except Exception as exc:
        errors.append("WIZNET5K(SPI): {}".format(exc))

    try:
        reset_w5500(reset_pin)
        nic = network.WIZNET5K()
        network_info = configure_dhcp(nic)
        NIC = nic
        return network_info
    except Exception as exc:
        errors.append("WIZNET5K(board): {}".format(exc))

    raise OSError("; ".join(errors))


def ensure_ethernet():
    if NIC is not None:
        try:
            if NIC.isconnected():
                return True
        except Exception:
            pass
    try:
        network_info = init_ethernet()
        print("[tisly] Ethernet IP:", network_info[0])
        return True
    except Exception as exc:
        print("[tisly] Ethernet retry:", exc)
        return False


def post_once(url, payload):
    if urequests is None:
        raise RuntimeError("urequests is required")
    if not ensure_ethernet():
        raise OSError("Ethernet is offline")
    headers = {"Content-Type": "application/json"}
    if DEVICE_TOKEN:
        headers["X-Remote-Test-Token"] = DEVICE_TOKEN
    response = None
    try:
        response = urequests.post(
            url,
            headers=headers,
            data=json.dumps(payload),
        )
        if response.status_code < 200 or response.status_code >= 300:
            raise OSError("HTTP {}".format(response.status_code))
        blink_success()
        return True
    finally:
        if response is not None:
            response.close()


def post_with_retry(url, payload):
    last_error = None
    for delay_ms in RETRY_DELAYS_MS:
        if delay_ms:
            time.sleep_ms(delay_ms)
        try:
            return post_once(url, payload)
        except Exception as exc:
            last_error = exc
            print("[tisly] POST retry:", exc)
    raise OSError("POST failed: {}".format(last_error))


def meter_payload(port, pulse_increment, raw_state):
    return {
        "device_id": DEVICE_ID,
        "port": "DI{}".format(port),
        "pulse_increment": pulse_increment,
        "raw_state": raw_state,
    }


def enqueue_meter(payload):
    remaining = payload["pulse_increment"]
    if payload["port"] != "DI1" or remaining <= 0:
        POST_QUEUE.append(payload)
        save_queue()
        return
    if (
        POST_QUEUE
        and POST_QUEUE[-1]["port"] == "DI1"
        and POST_QUEUE[-1]["pulse_increment"] > 0
        and POST_QUEUE[-1]["pulse_increment"] < 10000
    ):
        available = 10000 - POST_QUEUE[-1]["pulse_increment"]
        merged = min(available, remaining)
        POST_QUEUE[-1]["pulse_increment"] += merged
        remaining -= merged
    while remaining > 0:
        increment = min(10000, remaining)
        POST_QUEUE.append(meter_payload(1, increment, 1))
        remaining -= increment
    save_queue()


def flush_post_queue():
    while POST_QUEUE:
        payload = POST_QUEUE[0]
        try:
            post_with_retry(API_ENDPOINT, payload)
            POST_QUEUE.pop(0)
            save_queue()
        except Exception as exc:
            print("[tisly] queue retained:", exc)
            return False
    return True


def send_or_queue(payload):
    enqueue_meter(payload)
    flush_post_queue()


def irq_di1(_pin):
    global PENDING_PULSES, LAST_DI1_IRQ_AT
    now = time.ticks_ms()
    if time.ticks_diff(now, LAST_DI1_IRQ_AT) < DEBOUNCE_MS:
        return
    LAST_DI1_IRQ_AT = now
    PENDING_PULSES += 1


def irq_di2(_pin):
    global DI2_PENDING, DI2_IRQ_AT
    DI2_IRQ_AT = time.ticks_ms()
    DI2_PENDING = True


INPUTS[0].irq(trigger=Pin.IRQ_FALLING, handler=irq_di1)
INPUTS[1].irq(
    trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING,
    handler=irq_di2,
)


def process_di1():
    global PENDING_PULSES, PULSE_COUNT
    irq_state = disable_irq()
    pending = PENDING_PULSES
    PENDING_PULSES = 0
    enable_irq(irq_state)
    if pending <= 0:
        return
    PULSE_COUNT += pending
    send_or_queue(meter_payload(1, pending, 1))


def process_di2(now):
    global DI2_PENDING
    if not DI2_PENDING:
        return
    if time.ticks_diff(now, DI2_IRQ_AT) < DEBOUNCE_MS:
        return
    DI2_PENDING = False
    raw = INPUTS[1].value()
    if raw == LAST_STABLE[1]:
        return
    LAST_STABLE[1] = raw
    send_or_queue(meter_payload(2, 0, 1 if raw == 0 else 0))


def send_heartbeat():
    raw_state = 1 if INPUTS[0].value() == 0 else 0
    send_or_queue(meter_payload(1, 0, raw_state))


def run():
    print("[tisly] starting", DEVICE_ID)
    set_rgb(0, 0, 0)
    ensure_ethernet()
    next_heartbeat = time.ticks_add(time.ticks_ms(), HEARTBEAT_MS)
    next_queue_retry = time.ticks_ms()

    while True:
        now = time.ticks_ms()
        process_di1()
        process_di2(now)

        if time.ticks_diff(now, next_heartbeat) >= 0:
            send_heartbeat()
            next_heartbeat = time.ticks_add(now, HEARTBEAT_MS)

        if time.ticks_diff(now, next_queue_retry) >= 0:
            flush_post_queue()
            next_queue_retry = time.ticks_add(now, QUEUE_RETRY_MS)

        time.sleep_ms(5)


run()

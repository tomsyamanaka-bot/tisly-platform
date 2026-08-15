"""TiSLY gas meter firmware for Waveshare RP2350-ETH-8DI-8RO."""

import json
import time
import micropython
from machine import Pin

try:
    import urequests
except ImportError:
    urequests = None


DI_GPIO = (9, 10, 11, 12, 13, 14, 15, 16)
RETRY_DELAYS_MS = (1000, 3000, 10000)
DEBOUNCE_MS = 50
HEARTBEAT_MS = 60000
MAX_PENDING_POSTS = 256


def load_config():
    with open("config.json", "r") as source:
        return json.load(source)


CONFIG = load_config()
DEVICE_ID = str(CONFIG["device_id"])
API_ENDPOINT = str(CONFIG["api_endpoint"])
HEARTBEAT_ENDPOINT = str(
    CONFIG.get(
        "heartbeat_endpoint",
        "https://tisly.jp/api/device/ports/telemetry",
    )
)
DEVICE_TOKEN = str(CONFIG.get("device_token", ""))
DEBOUNCE_MS = max(50, int(CONFIG.get("debounce_ms", DEBOUNCE_MS)))
HEARTBEAT_MS = max(
    60000,
    int(CONFIG.get("heartbeat_interval_ms", HEARTBEAT_MS)),
)

INPUTS = [Pin(gpio, Pin.IN, Pin.PULL_UP) for gpio in DI_GPIO]
PENDING_IRQ = [False, False]
IRQ_AT = [0, 0]
LAST_ACCEPTED_AT = [-DEBOUNCE_MS, -DEBOUNCE_MS]
LAST_STABLE = [pin.value() for pin in INPUTS]
PULSE_COUNT = 0
POST_QUEUE = []
NIC = None

micropython.alloc_emergency_exception_buf(100)


def wait_for_dhcp(nic, timeout_ms=20000):
    deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
    while time.ticks_diff(deadline, time.ticks_ms()) > 0:
        if nic.isconnected():
            network_info = nic.ifconfig()
            if network_info and network_info[0] != "0.0.0.0":
                return network_info
        time.sleep_ms(200)
    raise OSError("Ethernet DHCP timeout")


def init_ethernet():
    """Initialize the onboard W5500 and acquire an address by DHCP."""
    global NIC
    import network

    errors = []

    if hasattr(network, "WIZNET5K"):
        try:
            nic = network.WIZNET5K()
            nic.active(True)
            nic.ifconfig("dhcp")
            NIC = nic
            return wait_for_dhcp(nic)
        except Exception as exc:
            errors.append("WIZNET5K(): {}".format(exc))

    if hasattr(network, "LAN"):
        try:
            nic = network.LAN()
            nic.active(True)
            try:
                nic.ifconfig("dhcp")
            except (TypeError, ValueError):
                pass
            NIC = nic
            return wait_for_dhcp(nic)
        except Exception as exc:
            errors.append("LAN(): {}".format(exc))

    try:
        from machine import SPI

        ethernet = CONFIG.get("ethernet", {})
        spi = SPI(
            int(ethernet.get("spi_id", 0)),
            baudrate=20_000_000,
            polarity=0,
            phase=0,
            sck=Pin(int(ethernet.get("sck", 34))),
            mosi=Pin(int(ethernet.get("mosi", 35))),
            miso=Pin(int(ethernet.get("miso", 36))),
        )
        nic = network.WIZNET5K(
            spi,
            Pin(int(ethernet.get("cs", 33))),
            Pin(int(ethernet.get("reset", 25))),
        )
        nic.active(True)
        nic.ifconfig("dhcp")
        NIC = nic
        return wait_for_dhcp(nic)
    except Exception as exc:
        errors.append("WIZNET5K(SPI): {}".format(exc))

    raise OSError("; ".join(errors))


def ensure_ethernet():
    if NIC is not None and NIC.isconnected():
        return True
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
            raise OSError(
                "HTTP {}: {}".format(
                    response.status_code,
                    response.text[:120],
                )
            )
        return True
    finally:
        if response is not None:
            response.close()


def post_with_retry(url, payload):
    last_error = None
    for delay_ms in RETRY_DELAYS_MS:
        try:
            return post_once(url, payload)
        except Exception as exc:
            last_error = exc
            print("[tisly] POST retry:", exc)
            time.sleep_ms(delay_ms)
    raise OSError("POST failed: {}".format(last_error))


def enqueue_post(url, payload):
    if len(POST_QUEUE) >= MAX_PENDING_POSTS:
        POST_QUEUE.pop(0)
    POST_QUEUE.append((url, payload))


def send_or_queue(url, payload):
    try:
        post_with_retry(url, payload)
    except Exception as exc:
        print("[tisly] queued:", exc)
        enqueue_post(url, payload)


def flush_post_queue():
    while POST_QUEUE:
        url, payload = POST_QUEUE[0]
        try:
            post_with_retry(url, payload)
            POST_QUEUE.pop(0)
        except Exception:
            return


def meter_payload(port, pulse_increment, raw_state):
    return {
        "device_id": DEVICE_ID,
        "port": "DI{}".format(port),
        "pulse_increment": pulse_increment,
        "raw_state": raw_state,
    }


def heartbeat_payload():
    return {
        "deviceId": DEVICE_ID,
        "firmwareVersion": "3.0.0-rp2350-gas-zip",
        "reason": "heartbeat",
        "debounceMs": DEBOUNCE_MS,
        "inputStates": {
            str(index + 1): "on" if pin.value() == 0 else "off"
            for index, pin in enumerate(INPUTS)
        },
        "relayStates": {
            str(index): "off" for index in range(1, 9)
        },
        "pulseCounts": {"1": PULSE_COUNT},
    }


def irq_di1(_pin):
    IRQ_AT[0] = time.ticks_ms()
    PENDING_IRQ[0] = True


def irq_di2(_pin):
    IRQ_AT[1] = time.ticks_ms()
    PENDING_IRQ[1] = True


INPUTS[0].irq(trigger=Pin.IRQ_FALLING, handler=irq_di1)
INPUTS[1].irq(
    trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING,
    handler=irq_di2,
)


def process_di1(now):
    global PULSE_COUNT
    if not PENDING_IRQ[0]:
        return
    if time.ticks_diff(now, IRQ_AT[0]) < DEBOUNCE_MS:
        return
    PENDING_IRQ[0] = False
    if INPUTS[0].value() != 0:
        return
    if time.ticks_diff(now, LAST_ACCEPTED_AT[0]) < DEBOUNCE_MS:
        return
    LAST_ACCEPTED_AT[0] = now
    PULSE_COUNT += 1
    send_or_queue(API_ENDPOINT, meter_payload(1, 1, 1))


def process_di2(now):
    if not PENDING_IRQ[1]:
        return
    if time.ticks_diff(now, IRQ_AT[1]) < DEBOUNCE_MS:
        return
    PENDING_IRQ[1] = False
    raw = INPUTS[1].value()
    if raw == LAST_STABLE[1]:
        return
    LAST_STABLE[1] = raw
    LAST_ACCEPTED_AT[1] = now
    send_or_queue(
        API_ENDPOINT,
        meter_payload(2, 0, 1 if raw == 0 else 0),
    )


def run():
    print("[tisly] starting", DEVICE_ID)
    ensure_ethernet()
    next_heartbeat = time.ticks_ms()
    next_queue_retry = time.ticks_ms()

    while True:
        now = time.ticks_ms()
        process_di1(now)
        process_di2(now)

        if time.ticks_diff(now, next_heartbeat) >= 0:
            send_or_queue(HEARTBEAT_ENDPOINT, heartbeat_payload())
            next_heartbeat = time.ticks_add(now, HEARTBEAT_MS)

        if time.ticks_diff(now, next_queue_retry) >= 0:
            flush_post_queue()
            next_queue_retry = time.ticks_add(now, 15000)

        time.sleep_ms(10)


run()

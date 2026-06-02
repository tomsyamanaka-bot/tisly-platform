"""TiSLY RP2350 Edition — main loop."""

import time

from config_loader import load_device, load_mqtt
from event_manager import EventManager
from hardware_board import Board
from heartbeat import Heartbeat
from input_manager import InputManager
from mqtt_client import (
    cmd_alarm_clear_topic,
    init_mqtt_client,
    publish_alarm,
    publish_event,
    publish_heartbeat,
    publish_relay,
    publish_state,
)
from relay_manager import RelayManager
from safety_manager import SafetyManager

try:
    from ethernet_mqtt import connect_network_and_mqtt
except ImportError:
    connect_network_and_mqtt = None


def _handle_mqtt_message(topic, msg, safety, relays, events, inputs):
    try:
        t = topic.decode() if isinstance(topic, bytes) else topic
        m = msg.decode() if isinstance(msg, bytes) else msg
    except Exception:
        return
    if t == cmd_alarm_clear_topic() and m.strip().lower() in ("1", "true", "clear"):
        ev = safety.clear_alarm()
        publish_alarm(False, alarm_mode=False)
        events.emit(ev)
        relays.sync_mqtt(inputs.stable_states(), safety.alarm_mode)


def run():
    print("TiSLY RP2350 Edition — boot")
    dev_cfg = load_device()
    mqtt_cfg = load_mqtt()
    board = Board()
    relays = RelayManager(board, publish_relay, publish_state)
    events = EventManager(publish_event)
    safety = SafetyManager(relays)
    debounce_ms = dev_cfg.get("debounce_ms", 50)
    inputs = InputManager(board, debounce_ms)
    hb = Heartbeat(dev_cfg.get("heartbeat_interval_sec", 30), publish_heartbeat)

    client = None
    if connect_network_and_mqtt:
        client = connect_network_and_mqtt(mqtt_cfg)
        if client:
            init_mqtt_client(client)
            try:
                client.set_callback(
                    lambda t, m: _handle_mqtt_message(t, m, safety, relays, events, inputs)
                )
                client.subscribe(cmd_alarm_clear_topic())
            except Exception as e:
                print("MQTT subscribe err:", e)
    else:
        print("WARN: ethernet_mqtt not ready — offline (see docs/rp2350_first_setup.md)")

    inputs.seed_from_hardware()
    relays.sync_mqtt(inputs.stable_states(), safety.alarm_mode)
    publish_alarm(False, alarm_mode=False)

    while True:
        if client:
            try:
                client.check_msg()
            except Exception:
                pass

        for i, prev, cur in inputs.poll():
            if cur == 1:
                evs = safety.on_di_active(i)
                events.emit_many(evs)
                if safety.alarm_mode:
                    publish_alarm(True, "emergency", alarm_mode=True)
                elif any(e.get("alarm") for e in evs):
                    publish_alarm(True, "window", alarm_mode=False)
            else:
                events.emit_many(safety.on_di_inactive(i))

            relays.sync_mqtt(inputs.stable_states(), safety.alarm_mode)

        hb.tick()
        time.sleep_ms(10)


if __name__ == "__main__":
    run()

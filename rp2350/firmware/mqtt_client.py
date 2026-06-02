"""MQTT publish/subscribe helpers (RP2350 topic layout)."""

import json
import time

from config_loader import load_mqtt

_client = None
_mqtt_cfg = None


def init_mqtt_client(client):
    global _client, _mqtt_cfg
    _client = client
    _mqtt_cfg = load_mqtt()


def _topics():
    return _mqtt_cfg.get("topics", {})


def _topic_relay_set(n):
    tpl = _topics().get("relay_set", "")
    if tpl:
        return tpl.replace("{n}", str(n))
    prefix = _mqtt_cfg.get("topic_prefix", "tisly/rp2350/unknown")
    return "{}/relay/{}/set".format(prefix, n)


def publish_state(di_list, relay_list, alarm_mode=False):
    if _client is None:
        return
    body = {
        "device_id": _mqtt_cfg.get("device_id", ""),
        "di": di_list,
        "relay": relay_list,
        "alarm_mode": alarm_mode,
        "ts": time.time(),
    }
    topic = _topics().get("state", _mqtt_cfg.get("topic_prefix", "") + "/state")
    retain = _mqtt_cfg.get("retain_state", True)
    qos = _mqtt_cfg.get("qos", 1)
    _client.publish(topic, json.dumps(body), qos=qos, retain=retain)


def publish_relay(channel, value):
    if _client is None:
        return
    qos = _mqtt_cfg.get("qos", 1)
    retain = _mqtt_cfg.get("retain_relay", True)
    _client.publish(_topic_relay_set(channel), str(1 if value else 0), qos=qos, retain=retain)


def publish_event(event_dict):
    if _client is None:
        return
    if "ts" not in event_dict:
        event_dict["ts"] = time.time()
    if "device_id" not in event_dict:
        event_dict["device_id"] = _mqtt_cfg.get("device_id", "")
    topic = _topics().get("event", "")
    qos = _mqtt_cfg.get("qos", 1)
    _client.publish(topic, json.dumps(event_dict), qos=qos)


def publish_alarm(active, detail=None, alarm_mode=None):
    if _client is None:
        return
    body = {
        "active": 1 if active else 0,
        "alarm_mode": alarm_mode if alarm_mode is not None else active,
        "ts": time.time(),
        "device_id": _mqtt_cfg.get("device_id", ""),
    }
    if detail:
        body["detail"] = detail
    topic = _topics().get("alarm", "")
    retain = _mqtt_cfg.get("retain_alarm", True)
    _client.publish(topic, json.dumps(body), qos=1, retain=retain)


def publish_heartbeat(uptime_sec, ip=None):
    if _client is None:
        return
    body = {
        "uptime": uptime_sec,
        "ts": time.time(),
        "device_id": _mqtt_cfg.get("device_id", ""),
    }
    if ip:
        body["ip"] = ip
    topic = _topics().get("heartbeat", "")
    _client.publish(topic, json.dumps(body), qos=0)


def cmd_topic():
    return _topics().get("cmd", _mqtt_cfg.get("topic_prefix", "") + "/cmd")


def cmd_alarm_clear_topic():
    return cmd_topic() + "/alarm_clear"

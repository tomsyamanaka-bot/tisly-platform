#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.22 — MQTT Topic Map Strengthening
MQTT_TOPICS.md に加え MQTT_TOPICS.json を構造化生成する。
"""

from __future__ import annotations

import json
from pathlib import Path

VERSION = "v5.22"
BUILDER_LABEL = f"TiSLY PLC Builder {VERSION} — MQTT Topic Map Strengthening"


def _load_node_red_config(project_dir: Path) -> dict:
    path = project_dir / "TISLY" / "NODE_RED_CONFIG.json"
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def generate_mqtt_topics_json(cfg: dict, project_name: str) -> str:
    device_id = str(cfg.get("device_id", "100"))
    base = f"tisly/device/{device_id}"
    payload = {
        "builder_version": BUILDER_LABEL,
        "project_name": project_name,
        "device_id": device_id,
        "broker": cfg.get("mqtt_broker", "mqtt.tisly.local"),
        "port": 1883,
        "topics": {
            "base": base,
            "state": f"{base}/state",
            "alarm": f"{base}/alarm",
            "motion": f"{base}/motion",
            "output": f"{base}/output",
            "cmd": f"{base}/cmd",
            "heartbeat": f"{base}/heartbeat",
            "recovery": f"{base}/recovery",
        },
        "qos_default": 1,
        "retain": {
            "state": True,
            "heartbeat": False,
        },
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def write_mqtt_topics_json(project_dir: Path) -> Path:
    cfg = _load_node_red_config(project_dir)
    project_name = project_dir.name
    path = project_dir / "TISLY" / "MQTT_TOPICS.json"
    path.write_text(generate_mqtt_topics_json(cfg, project_name), encoding="utf-8")
    return path


def mqtt_topics_json_valid(text: str) -> bool:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return False
    topics = data.get("topics", {})
    required = ("device_id", "state", "alarm", "motion", "output", "cmd", "heartbeat", "recovery")
    return all(k in topics or k == "device_id" and "device_id" in data for k in required) and all(
        k in topics for k in ("state", "alarm", "motion", "output", "cmd", "heartbeat", "recovery")
    )


def audit_mqtt_topics_json(project_dir: Path) -> list[tuple[str, bool, str]]:
    path = project_dir / "TISLY" / "MQTT_TOPICS.json"
    text = path.read_text(encoding="utf-8") if path.is_file() else ""
    valid = mqtt_topics_json_valid(text)

    return [
        ("MQTT_TOPICS.json 存在", path.is_file(), "OK" if path.is_file() else "なし"),
        ("MQTT 構造化トピック", valid, "8種" if valid else "NG"),
    ]

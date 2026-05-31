#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.15 — Node-RED Flow Generator
NODE_RED_CONFIG.json / DEVICE_MAP.csv / MQTT_TOPICS.md から
Node-RED インポート可能な TISLY_FLOWS.json を自動生成する。
"""

from __future__ import annotations

import csv
import io
import json
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path

VERSION = "v5.15"
BUILDER_LABEL = f"TiSLY PLC Builder {VERSION} — Node-RED Flow Generator"


@dataclass
class FlowContext:
    project_name: str
    device_id: str
    mqtt_broker: str
    mqtt_port: int
    base_topic: str
    alarm_topic: str
    motion_topic: str
    output_topic: str
    state_topic: str
    cmd_topic: str
    alarm_inputs: list[dict]
    motion_inputs: list[dict]
    contact_inputs: list[dict]
    outputs: list[dict]
    device_map: list[dict] = field(default_factory=list)


def _new_id(prefix: str = "n") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "tisly"


def build_flow_context(
    config_path: Path,
    device_map_path: Path | None = None,
    mqtt_topics_path: Path | None = None,
) -> FlowContext:
    """NODE_RED_CONFIG.json（および任意で DEVICE_MAP / MQTT_TOPICS）からコンテキストを構築。"""
    config = json.loads(config_path.read_text(encoding="utf-8"))
    device_id = str(config.get("device_id", "100"))
    base = f"tisly/device/{device_id}"

    device_map: list[dict] = []
    if device_map_path and device_map_path.is_file():
        reader = csv.DictReader(io.StringIO(device_map_path.read_text(encoding="utf-8")))
        device_map = list(reader)

    mqtt_topics_text = ""
    if mqtt_topics_path and mqtt_topics_path.is_file():
        mqtt_topics_text = mqtt_topics_path.read_text(encoding="utf-8")

    state_topic = f"{base}/state"
    cmd_topic = f"{base}/cmd"
    if mqtt_topics_text:
        for line in mqtt_topics_text.splitlines():
            line = line.strip()
            if line.endswith("/state"):
                state_topic = line
            elif line.endswith("/cmd"):
                cmd_topic = line

    return FlowContext(
        project_name=config.get("project_name", ""),
        device_id=device_id,
        mqtt_broker=config.get("mqtt_broker", "mqtt.tisly.local"),
        mqtt_port=1883,
        base_topic=base,
        alarm_topic=f"{base}/alarm",
        motion_topic=f"{base}/motion",
        output_topic=f"{base}/output",
        state_topic=state_topic,
        cmd_topic=cmd_topic,
        alarm_inputs=config.get("alarm_inputs", []),
        motion_inputs=config.get("motion_inputs", []),
        contact_inputs=config.get("contact_inputs", []),
        outputs=config.get("outputs", []),
        device_map=device_map,
    )


def generate_mqtt_broker_node(ctx: FlowContext, broker_id: str) -> dict:
    return {
        "id": broker_id,
        "type": "mqtt-broker",
        "name": "MQTT Broker",
        "broker": ctx.mqtt_broker,
        "port": str(ctx.mqtt_port),
        "clientid": f"tisly-nodered-{ctx.device_id}",
        "autoConnect": True,
        "usetls": False,
        "protocolVersion": "4",
        "keepalive": "60",
        "cleansession": True,
        "birthTopic": "",
        "birthQos": "0",
        "birthPayload": "",
        "birthMsg": {},
        "closeTopic": "",
        "closeQos": "0",
        "closePayload": "",
        "closeMsg": {},
        "willTopic": "",
        "willQos": "0",
        "willPayload": "",
        "willMsg": {},
    }


def _function_node(
    node_id: str,
    tab_id: str,
    name: str,
    func: str,
    wires: list[list[str]],
    x: int,
    y: int,
) -> dict:
    return {
        "id": node_id,
        "type": "function",
        "z": tab_id,
        "name": name,
        "func": func,
        "outputs": 1,
        "timeout": 0,
        "noerr": 0,
        "initialize": "",
        "finalize": "",
        "libs": [],
        "x": x,
        "y": y,
        "wires": wires,
    }


def _mqtt_in_node(
    node_id: str,
    tab_id: str,
    name: str,
    topic: str,
    broker_id: str,
    wires: list[list[str]],
    x: int,
    y: int,
    qos: str = "1",
) -> dict:
    return {
        "id": node_id,
        "type": "mqtt in",
        "z": tab_id,
        "name": name,
        "topic": topic,
        "qos": qos,
        "datatype": "auto-detect",
        "broker": broker_id,
        "nl": False,
        "rap": True,
        "rh": 0,
        "inputs": 0,
        "x": x,
        "y": y,
        "wires": wires,
    }


def _mqtt_out_node(
    node_id: str,
    tab_id: str,
    name: str,
    topic: str,
    broker_id: str,
    wires: list[list[str]],
    x: int,
    y: int,
) -> dict:
    return {
        "id": node_id,
        "type": "mqtt out",
        "z": tab_id,
        "name": name,
        "topic": topic,
        "qos": "1",
        "retain": "false",
        "respTopic": "",
        "contentType": "",
        "userProps": "",
        "correl": "",
        "expiry": "",
        "broker": broker_id,
        "x": x,
        "y": y,
        "wires": wires,
    }


def _debug_node(
    node_id: str,
    tab_id: str,
    name: str,
    wires: list[list[str]],
    x: int,
    y: int,
) -> dict:
    return {
        "id": node_id,
        "type": "debug",
        "z": tab_id,
        "name": name,
        "active": True,
        "tosidebar": True,
        "console": False,
        "tostatus": False,
        "complete": "payload",
        "targetType": "msg",
        "statusVal": "",
        "statusType": "auto",
        "x": x,
        "y": y,
        "wires": wires,
    }


def _comment_node(
    node_id: str,
    tab_id: str,
    name: str,
    info: str,
    x: int,
    y: int,
) -> dict:
    return {
        "id": node_id,
        "type": "comment",
        "z": tab_id,
        "name": name,
        "info": info,
        "x": x,
        "y": y,
        "wires": [],
    }


def generate_alarm_flow_nodes(
    ctx: FlowContext,
    tab_id: str,
    broker_id: str,
) -> list[dict]:
    """Alarm Handler: mqtt in → function → debug / push placeholder."""
    mqtt_in_id = _new_id("alarm_in")
    handler_id = _new_id("alarm_fn")
    debug_id = _new_id("alarm_dbg")
    push_id = _new_id("alarm_push")

    alarm_names = ", ".join(i.get("name", "") for i in ctx.alarm_inputs) or "—"
    handler_func = (
        f"// {BUILDER_LABEL}\n"
        f"// Alarm Handler — inputs: {alarm_names}\n"
        "const payload = typeof msg.payload === 'object'\n"
        "    ? msg.payload\n"
        "    : { value: msg.payload, source: msg.topic };\n"
        "msg.alarm = {\n"
        "    device_id: '" + ctx.device_id + "',\n"
        "    topic: msg.topic,\n"
        "    timestamp: new Date().toISOString(),\n"
        "    payload\n"
        "};\n"
        "msg.payload = msg.alarm;\n"
        "return msg;"
    )
    push_func = (
        f"// Push Notification Placeholder — {BUILDER_LABEL}\n"
        "// TODO: Firebase / Webhook 連携\n"
        "node.warn('TiSLY Push (alarm): ' + JSON.stringify(msg.payload));\n"
        "return null;"
    )

    return [
        _comment_node(
            _new_id("c"), tab_id, "Alarm Handler",
            f"Topic: {ctx.alarm_topic}\nInputs: {alarm_names}",
            120, 80,
        ),
        _mqtt_in_node(
            mqtt_in_id, tab_id, "MQTT Input Hub — Alarm",
            ctx.alarm_topic, broker_id, [[handler_id]], 120, 140,
        ),
        _function_node(
            handler_id, tab_id, "Alarm Handler",
            handler_func, [[debug_id, push_id]], 340, 140,
        ),
        _debug_node(debug_id, tab_id, "Debug Logger — Alarm", [[]], 560, 120),
        _function_node(
            push_id, tab_id, "Push Notification Placeholder",
            push_func, [[]], 560, 180,
        ),
    ]


def generate_motion_flow_nodes(
    ctx: FlowContext,
    tab_id: str,
    broker_id: str,
) -> list[dict]:
    """Motion Handler: mqtt in → function (debounce) → debug."""
    mqtt_in_id = _new_id("motion_in")
    handler_id = _new_id("motion_fn")
    debug_id = _new_id("motion_dbg")

    motion_names = ", ".join(i.get("name", "") for i in ctx.motion_inputs) or "—"
    handler_func = (
        f"// {BUILDER_LABEL}\n"
        f"// Motion Handler — inputs: {motion_names}\n"
        "const now = Date.now();\n"
        "const last = context.get('lastMotion') || 0;\n"
        "if (now - last < 3000) { return null; }\n"
        "context.set('lastMotion', now);\n"
        "msg.motion = {\n"
        "    device_id: '" + ctx.device_id + "',\n"
        "    topic: msg.topic,\n"
        "    timestamp: new Date().toISOString(),\n"
        "    payload: msg.payload\n"
        "};\n"
        "msg.payload = msg.motion;\n"
        "return msg;"
    )

    return [
        _comment_node(
            _new_id("c"), tab_id, "Motion Handler",
            f"Topic: {ctx.motion_topic}\nInputs: {motion_names}",
            120, 260,
        ),
        _mqtt_in_node(
            mqtt_in_id, tab_id, "MQTT Input Hub — Motion",
            ctx.motion_topic, broker_id, [[handler_id]], 120, 320,
        ),
        _function_node(
            handler_id, tab_id, "Motion Handler",
            handler_func, [[debug_id]], 340, 320,
        ),
        _debug_node(debug_id, tab_id, "Debug Logger — Motion", [[]], 560, 320),
    ]


def generate_output_flow_nodes(
    ctx: FlowContext,
    tab_id: str,
    broker_id: str,
) -> list[dict]:
    """Output Control: cmd mqtt in → function → mqtt out (output topic)."""
    cmd_in_id = _new_id("cmd_in")
    handler_id = _new_id("output_fn")
    mqtt_out_id = _new_id("output_out")
    debug_id = _new_id("output_dbg")

    output_names = ", ".join(o.get("name", "") for o in ctx.outputs) or "—"
    handler_func = (
        f"// {BUILDER_LABEL}\n"
        f"// Output Control — devices: {output_names}\n"
        "const cmd = typeof msg.payload === 'object' ? msg.payload : { action: msg.payload };\n"
        "msg.payload = {\n"
        "    device_id: '" + ctx.device_id + "',\n"
        "    cmd,\n"
        "    outputs: " + json.dumps([o.get("name") for o in ctx.outputs], ensure_ascii=False) + ",\n"
        "    timestamp: new Date().toISOString()\n"
        "};\n"
        "return msg;"
    )

    return [
        _comment_node(
            _new_id("c"), tab_id, "Output Control",
            f"Cmd: {ctx.cmd_topic}\nOutput: {ctx.output_topic}\nDevices: {output_names}",
            120, 440,
        ),
        _mqtt_in_node(
            cmd_in_id, tab_id, "MQTT Input Hub — Cmd",
            ctx.cmd_topic, broker_id, [[handler_id]], 120, 500,
        ),
        _function_node(
            handler_id, tab_id, "Output Control",
            handler_func, [[mqtt_out_id, debug_id]], 340, 500,
        ),
        _mqtt_out_node(
            mqtt_out_id, tab_id, "MQTT Out — Output",
            ctx.output_topic, broker_id, [[]], 560, 480,
        ),
        _debug_node(debug_id, tab_id, "Debug Logger — Output", [[]], 560, 540),
    ]


def generate_status_publish_nodes(
    ctx: FlowContext,
    tab_id: str,
    broker_id: str,
) -> list[dict]:
    """MQTT Status Publish: inject → function → mqtt out (state topic)."""
    inject_id = _new_id("state_inj")
    handler_id = _new_id("state_fn")
    mqtt_out_id = _new_id("state_out")
    debug_id = _new_id("state_dbg")

    contact_names = ", ".join(c.get("name", "") for c in ctx.contact_inputs) or "—"
    handler_func = (
        f"// {BUILDER_LABEL}\n"
        "// MQTT Status Publish\n"
        "msg.payload = {\n"
        "    device_id: '" + ctx.device_id + "',\n"
        "    project: '" + ctx.project_name.replace("'", "\\'") + "',\n"
        "    status: 'online',\n"
        "    contacts: " + json.dumps([c.get("name") for c in ctx.contact_inputs], ensure_ascii=False) + ",\n"
        "    timestamp: new Date().toISOString()\n"
        "};\n"
        "return msg;"
    )

    return [
        _comment_node(
            _new_id("c"), tab_id, "MQTT Status Publish",
            f"Topic: {ctx.state_topic}\nContacts: {contact_names}",
            120, 620,
        ),
        {
            "id": inject_id,
            "type": "inject",
            "z": tab_id,
            "name": "Status Tick (60s)",
            "props": [{"p": "payload"}],
            "repeat": "60",
            "crontab": "",
            "once": True,
            "onceDelay": "2",
            "topic": "",
            "payload": "",
            "payloadType": "date",
            "x": 130,
            "y": 680,
            "wires": [[handler_id]],
        },
        _function_node(
            handler_id, tab_id, "MQTT Status Publish",
            handler_func, [[mqtt_out_id, debug_id]], 360, 680,
        ),
        _mqtt_out_node(
            mqtt_out_id, tab_id, "MQTT Out — State",
            ctx.state_topic, broker_id, [[]], 580, 660,
        ),
        _debug_node(debug_id, tab_id, "Debug Logger — State", [[]], 580, 720),
    ]


def generate_ui_placeholder_nodes(ctx: FlowContext, tab_id: str) -> list[dict]:
    """TiSLY UI: comment + function stub → TISLY/UI/ PWA へ誘導。"""
    ui_id = _new_id("ui_fn")
    ui_func = (
        f"// TiSLY UI — {BUILDER_LABEL}\n"
        "// PWA Dashboard: TISLY/UI/index.html (v5.16 自動生成)\n"
        "node.status({ fill: 'green', shape: 'dot', text: 'UI ready' });\n"
        "return null;"
    )
    return [
        _comment_node(
            _new_id("c"), tab_id, "TiSLY UI Dashboard",
            f"Project: {ctx.project_name}\nDevice: {ctx.device_id}\n"
            "PWA: TISLY/UI/index.html",
            120, 800,
        ),
        _function_node(
            ui_id, tab_id, "TiSLY UI Dashboard",
            ui_func, [[]], 340, 860,
        ),
    ]


def generate_flows_array(ctx: FlowContext) -> list[dict]:
    """Node-RED インポート可能な flows 配列を生成。"""
    tab_id = _new_id("tab")
    broker_id = _new_id("broker")
    slug = _slug(ctx.project_name or f"device-{ctx.device_id}")

    nodes: list[dict] = [
        {
            "id": tab_id,
            "type": "tab",
            "label": f"TiSLY — {ctx.project_name or slug}",
            "disabled": False,
            "info": f"{BUILDER_LABEL}\nDevice ID: {ctx.device_id}",
            "env": [],
        },
        generate_mqtt_broker_node(ctx, broker_id),
    ]
    nodes.extend(generate_alarm_flow_nodes(ctx, tab_id, broker_id))
    nodes.extend(generate_motion_flow_nodes(ctx, tab_id, broker_id))
    nodes.extend(generate_output_flow_nodes(ctx, tab_id, broker_id))
    nodes.extend(generate_status_publish_nodes(ctx, tab_id, broker_id))
    nodes.extend(generate_ui_placeholder_nodes(ctx, tab_id))
    return nodes


def generate_flows_json(ctx: FlowContext) -> str:
    return json.dumps(generate_flows_array(ctx), ensure_ascii=False, indent=2) + "\n"


def write_node_red_flow_file(project_dir: Path) -> Path:
    """TISLY/ 配下の既存設定から TISLY_FLOWS.json を書き出す。"""
    tisly_dir = project_dir / "TISLY"
    config_path = tisly_dir / "NODE_RED_CONFIG.json"
    if not config_path.is_file():
        raise FileNotFoundError(f"NODE_RED_CONFIG.json が見つかりません: {config_path}")

    ctx = build_flow_context(
        config_path,
        tisly_dir / "DEVICE_MAP.csv",
        tisly_dir / "MQTT_TOPICS.md",
    )
    out_path = tisly_dir / "TISLY_FLOWS.json"
    out_path.write_text(generate_flows_json(ctx), encoding="utf-8")
    return out_path


# --- 監査ヘルパー ---

def _load_flows(text: str) -> list | None:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, list) else None


def flows_json_valid(text: str) -> bool:
    flows = _load_flows(text)
    if not flows:
        return False
    for node in flows:
        if not isinstance(node, dict):
            return False
        if "type" not in node:
            return False
        if node.get("type") != "mqtt-broker" and "id" not in node:
            return False
    return True


def flows_is_import_array(text: str) -> bool:
    flows = _load_flows(text)
    return flows is not None and len(flows) > 0


def flows_has_node_type(text: str, node_type: str) -> bool:
    flows = _load_flows(text)
    if not flows:
        return False
    return any(n.get("type") == node_type for n in flows)


def flows_has_topic_keyword(text: str, keyword: str) -> bool:
    return keyword in text


def flows_has_broker(text: str) -> bool:
    return flows_has_node_type(text, "mqtt-broker")


def flows_has_mqtt_in(text: str) -> bool:
    return flows_has_node_type(text, "mqtt in")


def flows_has_mqtt_out(text: str) -> bool:
    return flows_has_node_type(text, "mqtt out")


def flows_has_function(text: str) -> bool:
    return flows_has_node_type(text, "function")


def flows_has_debug(text: str) -> bool:
    return flows_has_node_type(text, "debug")


def flows_all_nodes_have_wires(text: str) -> bool:
    """tab / comment / broker 以外のフローノードに wires キーがあること。"""
    flows = _load_flows(text)
    if not flows:
        return False
    skip_types = {"tab", "comment", "mqtt-broker"}
    for node in flows:
        ntype = node.get("type", "")
        if ntype in skip_types:
            continue
        if "wires" not in node:
            return False
    return True


def audit_node_red_flows(project_dir: Path) -> list[tuple[str, bool, str]]:
    """TISLY_FLOWS.json 監査。戻り値: (name, passed, detail) のリスト。"""
    path = project_dir / "TISLY" / "TISLY_FLOWS.json"
    text = path.read_text(encoding="utf-8") if path.is_file() else ""

    checks = [
        ("TISLY_FLOWS.json 存在", path.is_file(), "OK" if path.is_file() else "ファイルなし"),
        ("JSON 読み込み", flows_json_valid(text), "OK" if flows_json_valid(text) else "JSON NG"),
        (
            "Node-RED import 配列形式",
            flows_is_import_array(text),
            "配列" if flows_is_import_array(text) else "配列でない",
        ),
        ("mqtt in ノード", flows_has_mqtt_in(text), "あり" if flows_has_mqtt_in(text) else "なし"),
        ("mqtt out ノード", flows_has_mqtt_out(text), "あり" if flows_has_mqtt_out(text) else "なし"),
        ("function ノード", flows_has_function(text), "あり" if flows_has_function(text) else "なし"),
        ("debug ノード", flows_has_debug(text), "あり" if flows_has_debug(text) else "なし"),
        ("broker ノード", flows_has_broker(text), "あり" if flows_has_broker(text) else "なし"),
        ("alarm topic", flows_has_topic_keyword(text, "/alarm"), "/alarm"),
        ("motion topic", flows_has_topic_keyword(text, "/motion"), "/motion"),
        ("output topic", flows_has_topic_keyword(text, "/output"), "/output"),
        ("state topic", flows_has_topic_keyword(text, "/state"), "/state"),
        ("cmd topic", flows_has_topic_keyword(text, "/cmd"), "/cmd"),
        (
            "ノード wires 属性",
            flows_all_nodes_have_wires(text),
            "OK" if flows_all_nodes_have_wires(text) else "wires 不足",
        ),
    ]
    return checks

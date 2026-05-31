#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.14 — TiSLY Integration Engine
PLC I/O 割付 → DEVICE_MAP / MQTT / ESP / Node-RED / システム概要を自動生成する。
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from dataclasses import dataclass
from pathlib import Path

from parts_mapper import EstimateBuildResult

VERSION = "v5.14"
BUILDER_LABEL = f"TiSLY PLC Builder {VERSION} — TiSLY Integration Engine"

# 入力カテゴリ → TiSLY 信号種別
INPUT_CATEGORY_MAP: dict[str, tuple[str, str]] = {
    "赤外線": ("Beam", "ALARM"),
    "PIR": ("PIR", "MOTION"),
    "マグネット": ("Door", "CONTACT"),
    "safety": ("EStop", "ALARM"),
    "system": ("Switch", "CONTACT"),
}

# 出力カテゴリ → TiSLY デバイス名プレフィックス
OUTPUT_CATEGORY_MAP: dict[str, str] = {
    "パトライト": "Siren",
    "zone": "WhiteLight",
    "alarm": "Buzzer",
}


@dataclass
class DeviceMapRow:
    plc_device: str
    tisly_name: str
    signal_type: str


@dataclass
class TislyIntegrationContext:
    project_name: str
    device_id: str
    plc_model: str
    purpose: str
    device_map: list[DeviceMapRow]
    alarm_inputs: list[str]
    motion_inputs: list[str]
    contact_inputs: list[str]
    output_devices: list[str]


def _derive_device_id(project_name: str) -> str:
    """案件名から 3 桁 device_id を生成。"""
    digest = hashlib.md5(project_name.encode("utf-8")).hexdigest()
    return str(int(digest[:6], 16) % 900 + 100)


def _sanitize_tisly_name(prefix: str, index: int) -> str:
    return f"{prefix}_{index:02d}"


def _map_input_entry(entry: object, counters: dict[str, int]) -> DeviceMapRow:
    category = getattr(entry, "category", "")
    prefix, signal = INPUT_CATEGORY_MAP.get(category, ("Input", "CONTACT"))
    if category == "safety" or "非常" in getattr(entry, "name", ""):
        prefix, signal = "EStop", "ALARM"
    elif category == "赤外線" or "赤外" in getattr(entry, "name", ""):
        prefix, signal = "Beam", "ALARM"
    elif category == "PIR" or "人感" in getattr(entry, "name", "") or "近接" in getattr(entry, "name", ""):
        prefix, signal = "PIR", "MOTION"
    elif category == "マグネット" or "ドア" in getattr(entry, "name", ""):
        prefix, signal = "Door", "CONTACT"

    counters[prefix] = counters.get(prefix, 0) + 1
    return DeviceMapRow(
        plc_device=getattr(entry, "device", ""),
        tisly_name=_sanitize_tisly_name(prefix, counters[prefix]),
        signal_type=signal,
    )


def _map_output_entry(entry: object, counters: dict[str, int]) -> DeviceMapRow:
    category = getattr(entry, "category", "")
    name = getattr(entry, "name", "")
    if category == "パトライト" or "赤灯" in name or "パトライト" in name or "満室" in name:
        prefix = "Siren"
    elif "ブザー" in name or category == "alarm":
        prefix = "Buzzer"
    elif name.startswith("白灯") or category == "zone":
        prefix = "WhiteLight"
    else:
        prefix = OUTPUT_CATEGORY_MAP.get(category, "Output")

    counters[prefix] = counters.get(prefix, 0) + 1
    tisly_name = prefix if counters[prefix] == 1 and prefix in ("Siren", "Buzzer") else _sanitize_tisly_name(prefix, counters[prefix])
    return DeviceMapRow(
        plc_device=getattr(entry, "device", ""),
        tisly_name=tisly_name,
        signal_type="OUTPUT",
    )


def build_tisly_context(
    assignment: object,
    *,
    project_name: str = "",
    plc_model: str = "FX5UJ-24MR/ES",
    purpose: str = "",
) -> TislyIntegrationContext:
    """I/O 割付から TiSLY 連携コンテキストを構築。"""
    device_id = _derive_device_id(project_name or "default")
    device_map: list[DeviceMapRow] = []
    in_counters: dict[str, int] = {}
    out_counters: dict[str, int] = {}

    for entry in getattr(assignment, "inputs", []):
        device_map.append(_map_input_entry(entry, in_counters))
    for entry in getattr(assignment, "outputs", []):
        device_map.append(_map_output_entry(entry, out_counters))

    alarm_inputs = [r.tisly_name for r in device_map if r.signal_type == "ALARM"]
    motion_inputs = [r.tisly_name for r in device_map if r.signal_type == "MOTION"]
    contact_inputs = [r.tisly_name for r in device_map if r.signal_type == "CONTACT"]
    output_devices = [r.tisly_name for r in device_map if r.signal_type == "OUTPUT"]

    return TislyIntegrationContext(
        project_name=project_name,
        device_id=device_id,
        plc_model=plc_model,
        purpose=purpose,
        device_map=device_map,
        alarm_inputs=alarm_inputs,
        motion_inputs=motion_inputs,
        contact_inputs=contact_inputs,
        output_devices=output_devices,
    )


def generate_device_map_csv(ctx: TislyIntegrationContext) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(["PLC_Device", "TiSLY_Name", "Signal_Type"])
    for row in ctx.device_map:
        writer.writerow([row.plc_device, row.tisly_name, row.signal_type])
    return buf.getvalue()


def generate_mqtt_topics_md(ctx: TislyIntegrationContext) -> str:
    base = f"tisly/device/{ctx.device_id}"
    per_device_lines = []
    for row in ctx.device_map:
        topic_type = row.signal_type.lower()
        if topic_type == "output":
            topic_type = "output"
        per_device_lines.append(f"{base}/{row.tisly_name.lower()}/{topic_type}")

    lines = [
        f"# MQTT トピック定義 — {ctx.project_name or '案件'}",
        "",
        f"**TiSLY PLC Builder {VERSION} — MQTT_TOPICS.md**",
        "",
        "## デバイス共通トピック",
        "",
        f"{base}/state",
        f"{base}/alarm",
        f"{base}/motion",
        f"{base}/output",
        "",
        "## 個別デバイストピック",
        "",
    ]
    lines.extend(per_device_lines or ["（デバイス未割付）"])
    lines.extend([
        "",
        "## ブローカー設定（参考）",
        "",
        "- Broker: `mqtt.tisly.local`（現地設置またはクラウド）",
        "- Port: `1883`（TLS 利用時は `8883`）",
        f"- Client ID: `tisly-esp-{ctx.device_id}`",
        "- QoS: `1`（alarm / motion）",
        "",
        f"---",
        f"",
        f"*{BUILDER_LABEL}*",
    ])
    return "\n".join(lines) + "\n"


def generate_esp_config_json(ctx: TislyIntegrationContext) -> str:
    inputs = []
    for row in ctx.device_map:
        if row.signal_type == "OUTPUT":
            continue
        inputs.append({
            "plc_device": row.plc_device,
            "name": row.tisly_name,
            "type": row.signal_type,
            "mqtt_topic": f"tisly/device/{ctx.device_id}/{row.tisly_name.lower()}/{row.signal_type.lower()}",
        })

    outputs = []
    for row in ctx.device_map:
        if row.signal_type != "OUTPUT":
            continue
        outputs.append({
            "plc_device": row.plc_device,
            "name": row.tisly_name,
            "type": "OUTPUT",
            "mqtt_topic": f"tisly/device/{ctx.device_id}/output",
        })

    config = {
        "device_id": ctx.device_id,
        "project_name": ctx.project_name,
        "mqtt_enabled": True,
        "mqtt_broker": "mqtt.tisly.local",
        "mqtt_port": 1883,
        "mqtt_client_id": f"tisly-esp-{ctx.device_id}",
        "plc_model": ctx.plc_model,
        "inputs": inputs,
        "outputs": outputs,
        "builder_version": BUILDER_LABEL,
    }
    return json.dumps(config, ensure_ascii=False, indent=2) + "\n"


def generate_node_red_config_json(ctx: TislyIntegrationContext) -> str:
    base = f"tisly/device/{ctx.device_id}"
    config = {
        "project_name": ctx.project_name,
        "device_id": ctx.device_id,
        "mqtt_broker": "mqtt.tisly.local",
        "alarm_inputs": [
            {"name": name, "topic": f"{base}/alarm", "plc": row.plc_device}
            for name, row in zip(ctx.alarm_inputs, [r for r in ctx.device_map if r.signal_type == "ALARM"])
        ],
        "motion_inputs": [
            {"name": name, "topic": f"{base}/motion", "plc": row.plc_device}
            for name, row in zip(ctx.motion_inputs, [r for r in ctx.device_map if r.signal_type == "MOTION"])
        ],
        "contact_inputs": [
            {"name": name, "topic": f"{base}/state", "plc": row.plc_device}
            for name, row in zip(ctx.contact_inputs, [r for r in ctx.device_map if r.signal_type == "CONTACT"])
        ],
        "outputs": [
            {"name": name, "topic": f"{base}/output", "plc": row.plc_device}
            for name, row in zip(ctx.output_devices, [r for r in ctx.device_map if r.signal_type == "OUTPUT"])
        ],
        "push_notification": {
            "enabled": True,
            "channels": ["alarm", "motion"],
        },
        "builder_version": BUILDER_LABEL,
    }
    return json.dumps(config, ensure_ascii=False, indent=2) + "\n"


def generate_tisly_system_md(ctx: TislyIntegrationContext) -> str:
    io_summary = "\n".join(
        f"| {r.plc_device} | {r.tisly_name} | {r.signal_type} |"
        for r in ctx.device_map
    ) or "| — | — | — |"

    return f"""# TiSLY システム概要 — {ctx.project_name or '案件'}

**TiSLY PLC Builder {VERSION} — TISLY_SYSTEM.md**

## 案件概要

- **案件名**: {ctx.project_name or '—'}
- **目的**: {ctx.purpose or '侵入検知・警告表示'}
- **Device ID**: `{ctx.device_id}`

---

## 1. PLC

| 項目 | 内容 |
|------|------|
| 型番 | {ctx.plc_model} |
| 入力点数 | {len([r for r in ctx.device_map if r.signal_type != 'OUTPUT'])} |
| 出力点数 | {len(ctx.output_devices)} |
| プログラム | `PLC_PROGRAM/GX3_COMMANDS.txt` |
| I/O 表 | `SPEC/IO_ASSIGNMENT.csv` |

---

## 2. ESP32 ゲートウェイ

- **役割**: PLC 接点状態の読取・MQTT ブリッジ
- **設定ファイル**: `TISLY/ESP_CONFIG.json`
- **Client ID**: `tisly-esp-{ctx.device_id}`
- **入力**: {len([r for r in ctx.device_map if r.signal_type != 'OUTPUT'])} 点
- **出力**: {len(ctx.output_devices)} 点

---

## 3. MQTT

- **Broker**: `mqtt.tisly.local:1883`
- **トピック定義**: `TISLY/MQTT_TOPICS.md`

| トピック | 用途 |
|----------|------|
| `tisly/device/{ctx.device_id}/state` | 全体状態 |
| `tisly/device/{ctx.device_id}/alarm` | 警報入力 |
| `tisly/device/{ctx.device_id}/motion` | 動体検知 |
| `tisly/device/{ctx.device_id}/output` | 出力制御 |

---

## 4. Node-RED

- **設定ファイル**: `TISLY/NODE_RED_CONFIG.json`
- **Alarm 入力**: {', '.join(ctx.alarm_inputs) or '—'}
- **Motion 入力**: {', '.join(ctx.motion_inputs) or '—'}
- **Contact 入力**: {', '.join(ctx.contact_inputs) or '—'}
- **出力**: {', '.join(ctx.output_devices) or '—'}

---

## 5. Push 通知

- 警報（ALARM）検知時に TiSLY アプリへ Push 通知
- 動体検知（MOTION）は設定により通知 ON/OFF 切替可能
- Node-RED フロー経由で Firebase / APNs 連携（v5.15 で自動フロー生成予定）

---

## 6. I/O ↔ TiSLY デバイスマップ

| PLC | TiSLY Name | Signal |
|-----|------------|--------|
{io_summary}

---

## 7. 将来連携

- **TiSLY UI ダッシュボード**: リアルタイム状態表示・履歴
- **クラウド録画連携**: 警報トリガーでカメラクリップ保存
- **v5.15 Node-RED フロー自動生成**: `flows.json` を案件ごとに出力
- **リモートメンテナンス**: OTA ファームウェア更新

---

*{BUILDER_LABEL}*
"""


def _resolve_context(
    assignment: object | None,
    estimate_result: EstimateBuildResult | None,
    project_name: str,
) -> TislyIntegrationContext:
    if estimate_result is not None:
        memo = estimate_result.memo
        return build_tisly_context(
            estimate_result.assignment,
            project_name=project_name or estimate_result.project_name,
            plc_model=memo.plc_model,
            purpose=memo.purpose,
        )
    return build_tisly_context(
        assignment,
        project_name=project_name,
        purpose="",
    )


def write_tisly_integration_files(
    project_dir: Path,
    *,
    assignment: object | None = None,
    estimate_result: EstimateBuildResult | None = None,
    project_name: str = "",
) -> dict[str, Path]:
    """TISLY/ 配下の 5 ファイルを書き出す。"""
    tisly_dir = project_dir / "TISLY"
    tisly_dir.mkdir(parents=True, exist_ok=True)

    ctx = _resolve_context(assignment, estimate_result, project_name)

    files = {
        "DEVICE_MAP.csv": tisly_dir / "DEVICE_MAP.csv",
        "MQTT_TOPICS.md": tisly_dir / "MQTT_TOPICS.md",
        "ESP_CONFIG.json": tisly_dir / "ESP_CONFIG.json",
        "NODE_RED_CONFIG.json": tisly_dir / "NODE_RED_CONFIG.json",
        "TISLY_SYSTEM.md": tisly_dir / "TISLY_SYSTEM.md",
    }

    files["DEVICE_MAP.csv"].write_text(generate_device_map_csv(ctx), encoding="utf-8")
    files["MQTT_TOPICS.md"].write_text(generate_mqtt_topics_md(ctx), encoding="utf-8")
    files["ESP_CONFIG.json"].write_text(generate_esp_config_json(ctx), encoding="utf-8")
    files["NODE_RED_CONFIG.json"].write_text(generate_node_red_config_json(ctx), encoding="utf-8")
    files["TISLY_SYSTEM.md"].write_text(generate_tisly_system_md(ctx), encoding="utf-8")

    return files


# --- 監査ヘルパー ---

def device_map_has_rows(text: str) -> bool:
    lines = [ln for ln in text.strip().splitlines() if ln.strip()]
    return len(lines) >= 2


def mqtt_topics_has_base_topics(text: str) -> bool:
    return all(k in text for k in ("/state", "/alarm", "/motion", "/output"))


def esp_config_valid(text: str) -> bool:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return False
    return (
        data.get("mqtt_enabled") is True
        and isinstance(data.get("inputs"), list)
        and isinstance(data.get("outputs"), list)
        and bool(data.get("device_id"))
    )


def node_red_config_valid(text: str) -> bool:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return False
    return (
        isinstance(data.get("alarm_inputs"), list)
        and isinstance(data.get("motion_inputs"), list)
        and isinstance(data.get("outputs"), list)
    )


def tisly_system_has_sections(text: str) -> bool:
    required = ("## 1. PLC", "## 2. ESP", "## 3. MQTT", "## 4. Node-RED", "## 5. Push", "## 7. 将来連携")
    return all(section in text for section in required)

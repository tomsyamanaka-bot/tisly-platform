#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.24 — QNAP Log Export Template
QNAP 保存前提の LOG_SCHEMA.json / LOG_README.md を生成する。
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

VERSION = "v5.24"
BUILDER_LABEL = f"TiSLY PLC Builder {VERSION} — QNAP Log Export Template"

LOG_FILES = ("LOG_SCHEMA.json", "LOG_README.md")


def generate_log_schema(project_name: str, device_id: str = "100") -> str:
    base_path = f"/share/TiSLY/logs/{project_name}"
    payload = {
        "builder_version": BUILDER_LABEL,
        "project_name": project_name,
        "device_id": device_id,
        "storage": {
            "type": "QNAP",
            "base_path": base_path,
            "rotation": "daily",
            "retention_days": 90,
        },
        "log_types": {
            "alarm_log": {
                "filename_pattern": "alarm_{date}.jsonl",
                "fields": ["timestamp", "device_id", "alarm_name", "plc_device", "value", "ack"],
            },
            "state_log": {
                "filename_pattern": "state_{date}.jsonl",
                "fields": ["timestamp", "device_id", "state_key", "value"],
            },
            "heartbeat_log": {
                "filename_pattern": "heartbeat_{date}.jsonl",
                "fields": ["timestamp", "device_id", "latency_ms", "status"],
            },
            "recovery_log": {
                "filename_pattern": "recovery_{date}.jsonl",
                "fields": ["timestamp", "device_id", "event", "action", "result", "detail"],
            },
        },
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def generate_log_readme(project_name: str) -> str:
    return f"""# QNAP ログ保存 — {project_name}

**{BUILDER_LABEL}**

## 概要

TiSLY システムログを QNAP NAS へ保存するためのスキーマ定義です。

## ログ種別

| 種別 | ファイル | 用途 |
|------|----------|------|
| alarm_log | alarm_YYYY-MM-DD.jsonl | 警報イベント |
| state_log | state_YYYY-MM-DD.jsonl | 状態変化 |
| heartbeat_log | heartbeat_YYYY-MM-DD.jsonl | 死活監視 |
| recovery_log | recovery_YYYY-MM-DD.jsonl | 復旧操作 |

## QNAP 設定

1. 共有フォルダ `TiSLY/logs/{project_name}` を作成
2. Node-RED / Recovery Engine から JSONL 追記
3. 90日ローテーション（LOG_SCHEMA.json 参照）

## サンプル行 (alarm_log)

```json
{{"timestamp":"2026-05-31T12:00:00Z","device_id":"100","alarm_name":"Beam_01","plc_device":"X2","value":1,"ack":false}}
```

---

*生成: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}*
*{BUILDER_LABEL}*
"""


def write_qnap_log_files(project_dir: Path) -> dict[str, Path]:
    tisly_dir = project_dir / "TISLY"
    tisly_dir.mkdir(parents=True, exist_ok=True)
    device_id = "100"
    mqtt_path = tisly_dir / "MQTT_TOPICS.json"
    if mqtt_path.is_file():
        device_id = json.loads(mqtt_path.read_text(encoding="utf-8")).get("device_id", "100")

    writers = {
        "LOG_SCHEMA.json": generate_log_schema(project_dir.name, str(device_id)),
        "LOG_README.md": generate_log_readme(project_dir.name),
    }
    paths: dict[str, Path] = {}
    for name, content in writers.items():
        path = tisly_dir / name
        path.write_text(content, encoding="utf-8")
        paths[name] = path
    return paths


def log_schema_valid(text: str) -> bool:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return False
    types = data.get("log_types", {})
    return all(k in types for k in ("alarm_log", "state_log", "heartbeat_log", "recovery_log"))


def audit_qnap_log(project_dir: Path) -> list[tuple[str, bool, str]]:
    schema_path = project_dir / "TISLY" / "LOG_SCHEMA.json"
    readme_path = project_dir / "TISLY" / "LOG_README.md"
    schema_text = schema_path.read_text(encoding="utf-8") if schema_path.is_file() else ""

    return [
        ("LOG_SCHEMA.json 存在", schema_path.is_file(), "OK" if schema_path.is_file() else "なし"),
        ("ログ4種定義", log_schema_valid(schema_text), "alarm/state/heartbeat/recovery" if log_schema_valid(schema_text) else "NG"),
        ("LOG_README.md", readme_path.is_file(), "OK" if readme_path.is_file() else "なし"),
    ]

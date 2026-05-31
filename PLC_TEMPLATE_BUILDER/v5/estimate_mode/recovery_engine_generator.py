#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.23 — Recovery Engine Template
TiSLY Recovery Engine 設定（heartbeat / offline / Shelly再起動 / 通知 / 復旧ログ）雛形
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

VERSION = "v5.23"
BUILDER_LABEL = f"TiSLY PLC Builder {VERSION} — Recovery Engine Template"

RECOVERY_FILES = ("RECOVERY_CONFIG.json", "RECOVERY_README.md")


def _load_mqtt_topics(project_dir: Path) -> dict:
    path = project_dir / "TISLY" / "MQTT_TOPICS.json"
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    cfg_path = project_dir / "TISLY" / "NODE_RED_CONFIG.json"
    if cfg_path.is_file():
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        device_id = str(cfg.get("device_id", "100"))
        base = f"tisly/device/{device_id}"
        return {"device_id": device_id, "topics": {"heartbeat": f"{base}/heartbeat", "recovery": f"{base}/recovery", "state": f"{base}/state"}}
    return {}


def generate_recovery_config(project_dir: Path) -> str:
    mqtt = _load_mqtt_topics(project_dir)
    topics = mqtt.get("topics", {})
    device_id = mqtt.get("device_id", "100")
    payload = {
        "builder_version": BUILDER_LABEL,
        "project_name": project_dir.name,
        "device_id": device_id,
        "heartbeat": {
            "topic": topics.get("heartbeat", f"tisly/device/{device_id}/heartbeat"),
            "interval_sec": 30,
            "offline_threshold_sec": 90,
        },
        "offline_detection": {
            "enabled": True,
            "check_interval_sec": 60,
            "notify_on_offline": True,
        },
        "shelly_restart": {
            "enabled": True,
            "candidates": [],
            "max_retries": 3,
            "cooldown_sec": 300,
            "note": "Shelly IP / デバイスID を現地設定で追加",
        },
        "notification": {
            "channels": ["mqtt", "push_placeholder"],
            "alarm_escalation_sec": 300,
            "recovery_notify": True,
        },
        "recovery_log": {
            "topic": topics.get("recovery", f"tisly/device/{device_id}/recovery"),
            "format": "json",
            "fields": ["timestamp", "device_id", "event", "action", "result"],
        },
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def generate_recovery_readme(project_name: str) -> str:
    return f"""# TiSLY Recovery Engine — {project_name}

**{BUILDER_LABEL}**

## 概要

デバイス死活監視・オフライン判定・Shelly 再起動候補・通知条件・復旧ログの雛形設定です。

## RECOVERY_CONFIG.json

| セクション | 内容 |
|------------|------|
| heartbeat | ハートビート間隔 / オフライン閾値 |
| offline_detection | オフライン判定ロジック |
| shelly_restart | Shelly 再起動候補リスト |
| notification | 通知チャネル / エスカレーション |
| recovery_log | 復旧ログ形式 |

## 運用手順

1. `shelly_restart.candidates` に Shelly デバイス IP を追加
2. Node-RED Recovery フローと連携
3. QNAP / ログサーバーへ `recovery_log` を転送

---

*生成: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}*
*{BUILDER_LABEL}*
"""


def write_recovery_engine_files(project_dir: Path) -> dict[str, Path]:
    tisly_dir = project_dir / "TISLY"
    tisly_dir.mkdir(parents=True, exist_ok=True)
    writers = {
        "RECOVERY_CONFIG.json": generate_recovery_config(project_dir),
        "RECOVERY_README.md": generate_recovery_readme(project_dir.name),
    }
    paths: dict[str, Path] = {}
    for name, content in writers.items():
        path = tisly_dir / name
        path.write_text(content, encoding="utf-8")
        paths[name] = path
    return paths


def recovery_config_valid(text: str) -> bool:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return False
    return all(k in data for k in ("heartbeat", "offline_detection", "shelly_restart", "notification", "recovery_log"))


def audit_recovery_engine(project_dir: Path) -> list[tuple[str, bool, str]]:
    config_path = project_dir / "TISLY" / "RECOVERY_CONFIG.json"
    readme_path = project_dir / "TISLY" / "RECOVERY_README.md"
    config_text = config_path.read_text(encoding="utf-8") if config_path.is_file() else ""

    return [
        ("RECOVERY_CONFIG.json 存在", config_path.is_file(), "OK" if config_path.is_file() else "なし"),
        ("Recovery 設定妥当性", recovery_config_valid(config_text), "OK" if recovery_config_valid(config_text) else "NG"),
        ("RECOVERY_README.md", readme_path.is_file(), "OK" if readme_path.is_file() else "なし"),
    ]

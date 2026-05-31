#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.21 — ESP Firmware Config Export
ESP_CONFIG.json から esp32/config.h と esp32/main_template.ino を生成する。
"""

from __future__ import annotations

import json
from pathlib import Path

VERSION = "v5.21"
BUILDER_LABEL = f"TiSLY PLC Builder {VERSION} — ESP Firmware Config Export"

ESP_FILES = ("esp32/config.h", "esp32/main_template.ino", "esp32/ESP_README.md")


def _load_esp_config(project_dir: Path) -> dict:
    path = project_dir / "TISLY" / "ESP_CONFIG.json"
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def generate_config_h(cfg: dict, project_name: str) -> str:
    device_id = cfg.get("device_id", "100")
    broker = cfg.get("mqtt_broker", "mqtt.tisly.local")
    port = cfg.get("mqtt_port", 1883)
    base = cfg.get("base_topic", f"tisly/device/{device_id}")
    wifi_ssid = cfg.get("wifi_ssid", "YOUR_WIFI_SSID")
    wifi_pass = cfg.get("wifi_password", "YOUR_WIFI_PASSWORD")

    return f"""// {BUILDER_LABEL}
// Project: {project_name}
// Arduino IDE / PlatformIO 共通 config.h

#ifndef TISLY_CONFIG_H
#define TISLY_CONFIG_H

#define TISLY_DEVICE_ID     "{device_id}"
#define TISLY_PROJECT_NAME  "{project_name}"

// WiFi
#define WIFI_SSID           "{wifi_ssid}"
#define WIFI_PASSWORD       "{wifi_pass}"

// MQTT
#define MQTT_BROKER         "{broker}"
#define MQTT_PORT           {port}
#define MQTT_CLIENT_ID      "tisly-esp-{device_id}"

// Topics
#define TOPIC_BASE          "{base}"
#define TOPIC_STATE         "{base}/state"
#define TOPIC_ALARM         "{base}/alarm"
#define TOPIC_MOTION        "{base}/motion"
#define TOPIC_OUTPUT        "{base}/output"
#define TOPIC_CMD           "{base}/cmd"
#define TOPIC_HEARTBEAT     "{base}/heartbeat"

// Timing
#define HEARTBEAT_INTERVAL_MS  30000
#define RECONNECT_DELAY_MS     5000

#endif // TISLY_CONFIG_H
"""


def generate_main_ino(cfg: dict, project_name: str) -> str:
    return f"""// {BUILDER_LABEL}
// Project: {project_name}
// Arduino IDE: File → Open → main_template.ino
// PlatformIO: src/main.cpp へ移植可能

#include "config.h"
#include <WiFi.h>
#include <PubSubClient.h>

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

unsigned long lastHeartbeat = 0;

void connectWiFi() {{
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {{
    delay(500);
    Serial.print(".");
  }}
  Serial.println(" connected");
}}

void connectMQTT() {{
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  while (!mqtt.connected()) {{
    if (mqtt.connect(MQTT_CLIENT_ID)) {{
      mqtt.subscribe(TOPIC_CMD);
      mqtt.publish(TOPIC_STATE, "{{\\"status\\":\\"online\\"}}");
    }} else {{
      delay(RECONNECT_DELAY_MS);
    }}
  }}
}}

void sendHeartbeat() {{
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {{
    lastHeartbeat = millis();
    mqtt.publish(TOPIC_HEARTBEAT, "{{\\"device\\":\\"" TISLY_DEVICE_ID "\\",\\"ts\\":" + String(millis()) + "}}");
  }}
}}

void setup() {{
  Serial.begin(115200);
  connectWiFi();
  connectMQTT();
  Serial.println("TiSLY ESP32 Gateway ready");
}}

void loop() {{
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();
  sendHeartbeat();
  // TODO: PLC I/O ミラー / Modbus RTU 連携をここに追加
}}
"""


def generate_esp_readme(project_name: str) -> str:
    return f"""# ESP32 ファームウェア — {project_name}

**{BUILDER_LABEL}**

## ファイル

| ファイル | 用途 |
|----------|------|
| config.h | WiFi / MQTT / トピック定義 |
| main_template.ino | Arduino IDE テンプレート |

## Arduino IDE

1. `esp32/` フォルダをスケッチフォルダとして開く
2. `config.h` の WiFi / MQTT を編集
3. ボード: ESP32 Dev Module
4. ライブラリ: PubSubClient, WiFi (組込)

## PlatformIO

```ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
lib_deps = knolleary/PubSubClient
```

`src/main.cpp` に `main_template.ino` の内容を配置し、`include/config.h` へ `config.h` をコピー。

---

*{BUILDER_LABEL}*
"""


def write_esp_firmware_files(project_dir: Path) -> dict[str, Path]:
    cfg = _load_esp_config(project_dir)
    project_name = project_dir.name
    esp_dir = project_dir / "TISLY" / "esp32"
    esp_dir.mkdir(parents=True, exist_ok=True)

    writers = {
        "config.h": generate_config_h(cfg, project_name),
        "main_template.ino": generate_main_ino(cfg, project_name),
        "ESP_README.md": generate_esp_readme(project_name),
    }
    paths: dict[str, Path] = {}
    for name, content in writers.items():
        path = esp_dir / name
        path.write_text(content, encoding="utf-8")
        paths[f"esp32/{name}"] = path
    return paths


def audit_esp_firmware(project_dir: Path) -> list[tuple[str, bool, str]]:
    esp_dir = project_dir / "TISLY" / "esp32"
    config_h = esp_dir / "config.h"
    main_ino = esp_dir / "main_template.ino"
    readme = esp_dir / "ESP_README.md"

    config_text = config_h.read_text(encoding="utf-8") if config_h.is_file() else ""
    main_text = main_ino.read_text(encoding="utf-8") if main_ino.is_file() else ""

    return [
        ("esp32/config.h 存在", config_h.is_file(), "OK" if config_h.is_file() else "なし"),
        ("esp32/main_template.ino 存在", main_ino.is_file(), "OK" if main_ino.is_file() else "なし"),
        ("config.h MQTT定義", "MQTT_BROKER" in config_text and "TOPIC_HEARTBEAT" in config_text, "OK" if "MQTT_BROKER" in config_text else "NG"),
        ("main.ino PubSubClient", "PubSubClient" in main_text and "setup()" in main_text, "OK" if "PubSubClient" in main_text else "NG"),
        ("ESP_README.md", readme.is_file(), "OK" if readme.is_file() else "なし"),
    ]

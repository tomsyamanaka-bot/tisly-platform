# ESP32 ファームウェア — CARSHOP_NIGHT_SECURITY

**TiSLY PLC Builder v5.21 — ESP Firmware Config Export**

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

*TiSLY PLC Builder v5.21 — ESP Firmware Config Export*

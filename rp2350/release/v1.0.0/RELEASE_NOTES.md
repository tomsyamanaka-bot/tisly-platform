# TiSLY RP2350 Edition v1.0.0（予定）

## 含むもの

- firmware/（MicroPython）
- config/
- node-red/tisly_home_v1.json
- web/ TiSLY UI v1
- test/TEST_SPEC.md

## リリース条件

- T1〜T10 すべて OK
- gpio_map.json 実機検証済み
- ethernet_mqtt.py 本番実装済み

## 既知の制限

- RS485 / Modbus は未使用
- MQTT TLS 未対応
- Web UI は LAN 内 WebSocket 前提

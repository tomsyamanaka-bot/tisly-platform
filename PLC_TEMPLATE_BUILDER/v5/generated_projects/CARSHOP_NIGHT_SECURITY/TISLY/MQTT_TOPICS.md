# MQTT トピック定義 — CARSHOP_NIGHT_SECURITY

**TiSLY PLC Builder v5.14 — MQTT_TOPICS.md**

## デバイス共通トピック

tisly/device/211/state
tisly/device/211/alarm
tisly/device/211/motion
tisly/device/211/output

## 個別デバイストピック

tisly/device/211/switch_01/contact
tisly/device/211/estop_01/alarm
tisly/device/211/beam_01/alarm
tisly/device/211/beam_02/alarm
tisly/device/211/beam_03/alarm
tisly/device/211/beam_04/alarm
tisly/device/211/pir_01/motion
tisly/device/211/pir_02/motion
tisly/device/211/siren/output
tisly/device/211/whitelight_01/output
tisly/device/211/whitelight_02/output
tisly/device/211/whitelight_03/output
tisly/device/211/whitelight_04/output

## ブローカー設定（参考）

- Broker: `mqtt.tisly.local`（現地設置またはクラウド）
- Port: `1883`（TLS 利用時は `8883`）
- Client ID: `tisly-esp-211`
- QoS: `1`（alarm / motion）

---

*TiSLY PLC Builder v5.14 — TiSLY Integration Engine*

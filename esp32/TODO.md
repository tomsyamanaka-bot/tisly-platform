# ESP32 実機差し替え準備（Phase 101–120）

実機未到着・未検証項目。完了したら `[x]` に更新。

## 接続・通信

- [ ] **Wi-Fi 設定** — `config/wifi.json` または NVS に SSID/PSK、静的 IP 任意
- [ ] **MQTT 接続** — ブローカー IP、認証、`docs/mqtt_unified_topics.md` の統一トピック
- [ ] **heartbeat** — 30s → `tisly/{tenant}/{site}/{device_id}/heartbeat`
- [ ] **device_id** — `ESP-HOME-001` 形式（`docs/device_id_rules.md`）

## I/O

- [ ] **GPIO 入力** — プルアップ/プルダウン、NC/NO と `active_low` 一致
- [ ] **リレー出力** — 極性実測、100V は外部リレー
- [ ] **状態 publish** — DI/リレーを `.../state` JSON

## クラウド連携

- [ ] **server 登録** — `POST /api/devices/register`
- [ ] **Node-RED** — `node-red/tisly_real_device_ingest_v1.json` で ingest
- [ ] **テスト** — `POST /api/devices/ESP-HOME-001/test`

## ファームウェア構成

- [ ] **config 分離** — `config/mqtt.json`, `config/gpio.json`, `config/device.json`（新規作成）
- [ ] **OTA 候補** — HTTPS OTA URL、署名検証（Phase 121+）
- [ ] テンプレ参照 — `PLC_TEMPLATE_BUILDER/.../TISLY/esp32/` の `main_template.ino`

## 実機テスト手順

1. USB シリアルで起動ログ確認
2. Wi-Fi 接続・IP ping
3. `mosquitto_sub -t 'tisly/+/+/ESP-HOME-001/#' -v`
4. 入力1路変化 → `state` / `event`
5. `curl -X POST http://localhost:3080/api/test/heartbeat -d '{"deviceId":"ESP-HOME-001"}'`
6. チェックリスト — `docs/real_device_integration_checklist.md`

## PC 上のみ（ブローカー + シミュレータ）

- [ ] Python/Node で MQTT publish シミュレーション
- [ ] server `npm run demo` と併用可

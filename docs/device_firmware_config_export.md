# デバイス証明書 → ファームウェア設定エクスポート（Phase 401–420）

## API

```
GET /api/customer/:code/devices/:id/firmware-config
Authorization: Bearer <viewer|installer JWT>
```

## 返却 JSON

| フィールド | 説明 |
|-----------|------|
| `device_id` | 設備 ID |
| `mqtt_topic` | 推奨 publish トピック（site + type + id） |
| `cert_placeholder` | デバイス証明書 PEM（placeholder または CSR 発行後） |
| `ca_placeholder` | CA バンドル PEM |
| `endpoint` | MQTT ホスト名（`MQTT_URL` から抽出） |
| `heartbeat_interval_sec` | `HEARTBEAT_WARN_SEC` |
| `client_id` | `{customerCode}-{deviceId}` |
| `provisioning_mode` | `CERT_PROVISIONING_MODE`（mock / ca / acme） |

## 現場フロー

1. PWA で CSR 登録 → 証明書発行（placeholder）
2. **ファーム設定 JSON** を取得
3. ESP32 / RP2350 の `config.h` または NVS に PEM / topic / endpoint を書き込み
4. フラッシュ後 Live MQTT テスト

詳細手順: `docs/esp32_rp2350_firmware_flash.md`, `docs/device_certificate_pipeline.md`

## 実装

`server/src/installer/firmware-config.ts` — `buildFirmwareConfig()`

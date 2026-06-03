# MQTT TLS + クライアント証明書（Phase 781–820）

## 環境変数

| 変数 | 説明 |
|------|------|
| `MQTT_TLS_ENABLED` | `true` で TLS/mTLS を有効化 |
| `MQTT_CA_PATH` | CA 証明書パス |
| `MQTT_CERT_PATH` | クライアント証明書 |
| `MQTT_KEY_PATH` | クライアント秘密鍵 |
| `MQTT_TLS_REJECT_UNAUTHORIZED` | 既定 `true`（`false` で検証緩和） |

## フォールバック

- 証明書パス未設定またはファイル欠落 → **mock subscriber** へ安全にフォールバック
- `MQTT_MOCK_MODE=true` または `MQTT_SUBSCRIBER_ENABLED` 未設定時も mock

## API / UI

- `GET /api/toms/live/connection-status` — `mqtt.tls` に cert 状態
- `GET /api/toms/live/mqtt-logs` — `certStatus` フィールド

## 実装

- `server/src/mqtt/mqtt-tls.ts`
- `server/src/mqtt/mqtt-subscriber.ts` — `mqtts://` + connect options

# MQTT ACL / ACK フィールドテスト（Phase 401–420）

## 概要

施工 PWA からデバイス単位で **publish → ack topic 待ち → RTT 保存** を行う Live MQTT テスト API です。

## API

```
POST /api/customer/:code/devices/:id/test/live-mqtt
Authorization: Bearer <installer JWT>
```

### レスポンス例

```json
{
  "ok": true,
  "ack_received": true,
  "rtt_ms": 62,
  "timeout": false,
  "topic": "tisly/{siteId}/{deviceId}/test/live",
  "ack_topic": "tisly/{siteId}/{deviceId}/test/live/ack",
  "tested_at": "2026-06-03T12:00:00.000Z",
  "mock": false,
  "broker_status": "connected",
  "message": "ACK received on ack topic"
}
```

## 実装

| モジュール | 役割 |
|-----------|------|
| `server/src/mqtt/ack-tracker.ts` | publish / subscribe ack / timeout / `last_test_result` へ RTT 保存 |
| `server/src/installer/mqtt-rtt-probe.ts` | ブローカー接続判定（既存 RTT と共有） |

## 環境変数

| 変数 | 説明 |
|------|------|
| `FIELD_LIVE_MODE=true` | 実ブローカー向け（未設定時は mock RTT） |
| `MQTT_ACK_REQUIRED=true` | サーバーが自己 ack を送らず、デバイス/ゲートウェイからの ack を待つ |
| `MQTT_URL` | ブローカー URL |
| `MQTT_MOCK_MODE=false` | mock heartbeat / RTT を無効化 |

## ブローカー ACL（本番準備）

本番ではデバイス証明書ごとに次を許可することを推奨します。

- **Publish**: `tisly/{siteId}/{deviceId}/test/live`, `tisly/{siteId}/{deviceId}/heartbeat`
- **Subscribe**: `tisly/{siteId}/{deviceId}/cmd/#`
- **Publish (ack)**: デバイス → `tisly/{siteId}/{deviceId}/test/live/ack`

施工サーバー（installer API）は一時的に `+/test/live` と `+/test/live/ack` を subscribe 可能なサービスアカウントを使用します。

## オフライン同期

キュー action `mqttTest` → サーバー `mqtt_test_result` で RTT をマージ同期します。

## 関連

- `docs/mqtt_field_diagnostics.md`
- `POST .../test/mqtt-rtt`（サーバー往復プローブ）

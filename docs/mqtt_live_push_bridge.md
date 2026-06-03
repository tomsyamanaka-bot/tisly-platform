# MQTT Live Push Bridge（Phase 741–780）

## 概要

MQTT トピックを WebSocket (`/ws`) 経由で PRO Remote / 案件司令塔へ配信します。

## 環境変数

| 変数 | 既定 | 説明 |
|------|------|------|
| `MQTT_MOCK_MODE` | `true` | `false` でブローカー実接続 |
| `MQTT_SUBSCRIBER_ENABLED` | — | `true` で subscriber 起動 |
| `LIVE_OPS_MOCK_PUSH` | mock 時 `true` | `false` で 12s 模擬 push 停止 |

## トピック

- 標準: `tisly/{tenant}/{site}/{device}/{channel}`
- 案件ライブ: `tisly/project/{projectId}/{devices|notifications|timeline|floor_alert}`

## API

- `GET /api/toms/live/connection-status`
- `GET /api/toms/live/mqtt-logs`
- `POST /api/toms/live/mock-push/stop`

## ログコード

- `INVALID_TOPIC` / `INVALID_PAYLOAD` / `AUTH_FAILED` / `DISCONNECTED` / `CONNECTED`

# MQTT 本番接続ガイド（Phase 1041–1050）

## 概要

TiSLY Platform は ESP 実機の heartbeat を MQTT ブローカー経由で受信する。  
Phase 1041–1050 で deployment 向けの接続チェック API を追加し、`MQTT_MODE` による mock/real 切替を明確化した。

## 環境変数

| 変数 | 説明 | 既定 |
|------|------|------|
| `MQTT_MODE` | `mock` または `real` | `mock` |
| `MQTT_URL` | ブローカー URL | `mqtt://127.0.0.1:1883` |
| `MQTT_USERNAME` | 認証ユーザー名 | — |
| `MQTT_PASSWORD` | 認証パスワード（画面・ログに出力しない） | — |
| `MQTT_TOPIC_PREFIX` | 購読 prefix | `tisly` |

### mock モード（開発・実機未接続）

```env
MQTT_MODE=mock
```

- subscriber は mock 動作
- `POST /api/deployment/mqtt/test-heartbeat` でシミュレート heartbeat を記録
- 施工 PWA の MQTT 未確認カードも mock で通過可能

### real モード（本番）

```env
MQTT_MODE=real
MQTT_URL=mqtts://broker.example.com:8883
MQTT_USERNAME=tisly-server
MQTT_PASSWORD=<secret>
MQTT_TOPIC_PREFIX=tisly
MQTT_SUBSCRIBER_ENABLED=true
```

TLS 設定は `docs/mqtt_tls_client_cert.md` を参照。

## トピック形式

```
tisly/{customerCode}/{siteId}/{deviceId}/heartbeat
```

例: `tisly/TOMS001/site-abc/ESP-LIVING/heartbeat`

## API

### GET /api/deployment/mqtt/status

クエリ: `?customerCode=TOMS001`（任意）

レスポンス例:

```json
{
  "phase": "1041-1050",
  "mode": "mock",
  "brokerConfigured": true,
  "topicPrefix": "tisly",
  "subscriberEnabled": false,
  "devices": [
    {
      "device_id": "TOMS001-ESP-ABC123",
      "customer_code": "TOMS001",
      "site_id": "site-xyz",
      "last_seen": "2026-06-05T10:00:00.000Z",
      "mqtt_topic": "tisly/TOMS001/site-xyz/TOMS001-ESP-ABC123/heartbeat",
      "heartbeat_status": "ok"
    }
  ]
}
```

### POST /api/deployment/mqtt/test-heartbeat

認証: admin JWT

```json
{
  "deviceId": "TOMS001-ESP-ABC123",
  "customerCode": "TOMS001",
  "siteId": "site-xyz"
}
```

mock 時は DB に heartbeat を記録し `last_seen` を返す。real 時も同 API で接続確認の起点となる。

## 既存インフラとの関係

| モジュール | 役割 |
|-----------|------|
| `mqtt-subscriber.ts` | ブローカー購読 |
| `esp-heartbeat-mqtt.ts` | heartbeat → デバイス状態更新 |
| `mqtt-live-push-bridge.ts` | ライブ push ブリッジ |
| `installer/mqtt-rtt-probe.ts` | 施工 PWA RTT 診断 |

`MQTT_MODE` 未設定時は従来の `MQTT_MOCK_MODE` / `MQTT_SUBSCRIBER_ENABLED` ロジックにフォールバック。

## 運用手順

1. `.env` で `MQTT_MODE=mock` のまま顧客オンボーディング完了
2. ESP 設備登録後 `test-heartbeat` で mock 確認
3. 現場で実機接続後 `MQTT_MODE=real` に切替
4. 施工 PWA `/customer/:code/install/home` で MQTT未確認カードが 0 になることを確認

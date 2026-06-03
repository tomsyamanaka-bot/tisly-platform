# MQTT 現場診断（Phase 381–400）

## 診断取得

```
GET /api/customer/:code/install/mqtt/:deviceId
```

## RTT 実測

```
POST /api/customer/:code/devices/:id/test/mqtt-rtt
```

| フィールド | 説明 |
|------------|------|
| `rtt_ms` / `roundTripMs` | 往復 ms |
| `timeout` | タイムアウト時 true |
| `broker_status` | `connected` / `unconfigured` / `error` |
| `topic` | テスト publish トピック |
| `tested_at` | ISO 時刻 |
| `mock` | `MQTT_URL` 未設定または probe 失敗時 true |

## 動作

- `MQTT_URL` が .env にあり `MQTT_MOCK_MODE` が true でない → `mqtt-rtt-probe.ts` で publish/ack 計測
- 未設定 → 従来どおり mock RTT
- 実装: `device-connectivity-test.ts` · `mqtt-rtt-probe.ts`

## 施工 PWA

MQTT タブ → **RTT実測**

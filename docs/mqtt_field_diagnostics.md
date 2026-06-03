# MQTT 現場診断（Phase 361–380）

## 診断取得

```
GET /api/customer/:code/install/mqtt/:deviceId
```

トピック・最終 heartbeat・`latencyMs`（RTT 実測後に反映）

## RTT 実測（placeholder）

```
POST /api/customer/:code/devices/:id/test/mqtt-rtt
```

| 項目 | 説明 |
|------|------|
| publish | テストメッセージ送信（mock） |
| ack | ブローカー未設定時はシミュレーション |
| `roundTripMs` | 往復 ms |
| `timeout` | 5s 超過時 `false` |
| `mock` | ブローカー未接続時 `true` |

実装: `server/src/installer/device-connectivity-test.ts` — `runMqttRttTest`

## 施工 PWA

MQTT タブ → **RTT実測（mock可）**

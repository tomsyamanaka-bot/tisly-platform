# ESP32 MQTT 本番トピック（Phase 981–1000）

## 本番形式

```
tisly/{customerCode}/{siteId}/{deviceId}/heartbeat
tisly/{customerCode}/{siteId}/{deviceId}/event
tisly/{customerCode}/{siteId}/{deviceId}/ack
tisly/{customerCode}/{siteId}/{deviceId}/cmd
```

## デモ互換

- `tisly/{tenant}/demo-test-site/MOCK-MQTT-001/heartbeat`
- `DEMO-ESP-*` デバイス ID
- レガシー `state` / `recovery` チャンネル

## コード

- `server/src/mqtt/esp-topic-standard.ts` — `buildEspMqttTopic`, `parseEspMqttTopic`
- `server/src/mqtt/topic-router.ts` — 受信ルーティング
- `/devices` — 本番 topic 列

## 例（TOMS001）

```
tisly/TOMS001/site-main/ESP-LIVING/heartbeat
```

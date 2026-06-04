# ESP32 MQTT トピック標準（Phase942）

## 本番形式

```
tisly/{customerCode}/{siteId}/{deviceId}/heartbeat
tisly/{customerCode}/{siteId}/{deviceId}/event
tisly/{customerCode}/{siteId}/{deviceId}/ack
tisly/{customerCode}/{siteId}/{deviceId}/cmd
```

実装: `server/src/mqtt/esp-topic-standard.ts`

## デモ互換（Phase901 維持）

| レガシー | 説明 |
|----------|------|
| `tisly/{tenant}/demo-test-site/MOCK-MQTT-001/heartbeat` | MQTT mock 120秒 |
| `DEMO-ESP-LIVING` 等 | デバイス ID（DB/営業デモ） |
| `event/state/recovery` チャンネル | 旧 topic-router も受理 |

## マッピング例

`DEMO-ESP-LIVING` → `tisly/TOMS001/site-001/ESP-LIVING/heartbeat`

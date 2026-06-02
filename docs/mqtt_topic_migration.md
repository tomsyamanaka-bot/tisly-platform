# MQTT 統一トピック移行表（Phase 121–140）

## 新形式（正）

```
tisly/{tenant_id}/{site_id}/{device_id}/{channel}
```

`channel`: `state` | `event` | `heartbeat` | `cmd` | `recovery`

---

## ESP32

| 旧 | 新 |
|----|-----|
| `tisly/home/esp32/event` | `tisly/default/moriya-home/ESP-GATE-001/event` |
| `tisly/esp32/heartbeat` | `tisly/default/moriya-home/ESP-GATE-001/heartbeat` |

## RP2350

| 旧 | 新 |
|----|-----|
| `tisly/rp2350/state` | `tisly/default/moriya-home/RP2350-GW-001/state` |
| `tisly/rp2350/event` | `tisly/default/moriya-home/RP2350-GW-001/event` |

## PLC（Modbus ゲートウェイ経由）

| 旧 | 新 |
|----|-----|
| `tisly/plc/alarm` | `tisly/default/factory-a/PLC-LINE-001/event` |
| `tisly/plc/cmd` | `tisly/default/factory-a/PLC-LINE-001/cmd` |

## Node-RED

| 旧 | 新 |
|----|-----|
| `tisly/+/event`（ワイルドカード） | `tisly/+/+/+/event` |
| HTTP のみ ingest | **継続推奨** + MQTT は `tisly_real_device_ingest_v1.json` |

## Google TV

| 旧 | 新 |
|----|-----|
| WS `/ws` のみ | **継続**（警報・ダッシュボード） |
| — | オプション: `tisly/default/{site}/TV-xxx/heartbeat` |

---

移行手順: Node-RED / ファームを新トピックに切替 → 並行運用 1 週間 → 旧トピック購読停止。

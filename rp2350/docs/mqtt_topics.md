# MQTT トピック仕様 — TiSLY RP2350 Edition

`device_id` は `config/device.json` / `config/mqtt.json` で定義（既定: `rp2350-home-01`）。

ベース: `tisly/rp2350/{device_id}/`

## トピック一覧

| トピック | QoS | Retain | ペイロード |
|----------|-----|--------|------------|
| `tisly/rp2350/{device_id}/state` | 1 | 推奨 | JSON: DI/RO/alarm_mode スナップショット |
| `tisly/rp2350/{device_id}/event` | 1 | なし | JSON: センサー・警報イベント |
| `tisly/rp2350/{device_id}/alarm` | 1 | **あり** | JSON: `active`, `alarm_mode`, `ts` |
| `tisly/rp2350/{device_id}/heartbeat` | 0 | なし | JSON: `uptime`, `ts`, `device_id` |
| `tisly/rp2350/{device_id}/cmd/alarm_clear` | 1 | なし | `clear` / `1` / `true` |
| `tisly/rp2350/{device_id}/relay/{n}/set` | 1 | 推奨 | `0` または `1` |

## state ペイロード例

```json
{
  "device_id": "rp2350-home-01",
  "di": [0, 0, 0, 0, 0, 0, 0, 0],
  "relay": [0, 0, 0, 0, 0, 0, 0, 0],
  "alarm_mode": false,
  "ts": 1717000000.0
}
```

## event ペイロード例

```json
{
  "type": "ir_beam",
  "di": 1,
  "name": "赤外線ビーム①",
  "message": "100Vライト① ON",
  "device_id": "rp2350-home-01",
  "ts": 1717000000.0
}
```

## alarm ペイロード例

```json
{
  "active": 1,
  "alarm_mode": true,
  "detail": "emergency",
  "device_id": "rp2350-home-01",
  "ts": 1717000000.0
}
```

## heartbeat

- 間隔: **30秒**（`config/device.json` の `heartbeat_interval_sec`）
- Node-RED / Web UI は 45秒警告・90秒通信断（グレー）を推奨

## 旧トピック（Phase1〜10）

`tisly/home/*` は **RP2350 Edition では使用しません**。ESP 版・旧フロー `tisly_home_v1.json` 専用です。

## PC テスト

```bash
python rp2350/test/simulator/simulator_publish.py [broker_ip]
python rp2350/test/simulator/simulator_inputs.py [broker_ip]
```

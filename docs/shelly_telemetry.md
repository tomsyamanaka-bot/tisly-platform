# Shelly テレメトリ（Phase 981–1000）

## フィールド

| 項目 | 説明 |
|------|------|
| `online` | RPC 応答可否 |
| `relay` | リレー ON/OFF |
| `voltage` / `current` / `powerW` | 電力系 |
| `uptimeSec` | `sys.uptime` |
| `wifiRssi` | `wifi.rssi` |
| `temperatureC` | 温度センサー（機種による） |
| `connectionError` | real 失敗時（例: `real接続失敗`） |
| `mock` / `envMode` | mock / real 識別 |

## 取得経路

1. `GET /api/shelly/status` — `shelly-real-client`
2. `GET /api/demo-kit/shelly/telemetry/:deviceId` — `fetchShellyTelemetryAsync`
3. `POST /api/demo-kit/shelly/poll` — DB metadata 更新
4. `/api/demo-kit/devices/registry` — Shelly 行の `shellyTelemetry`

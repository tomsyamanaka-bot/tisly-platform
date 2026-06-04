# Shelly Real Bridge（Phase 903）

## 設定

`PUT /api/demo-kit/shelly/config`

```json
{
  "deviceId": "TOMS001-SHELLY-01",
  "ip": "192.168.1.50",
  "name": "1F 照明",
  "location": "1F 廊下"
}
```

## 取得項目

- Relay 状態
- 電圧 (V)
- 電流 (A)
- 消費電力 (W)

`GET /api/demo-kit/shelly/telemetry/:deviceId`

## mock 切替

`deviceMode=mock` のときは固定 telemetry。`shelly` / `mixed` で実機 RPC を試行（3秒タイムアウト）。

## 実装

`server/src/device/shelly-bridge.ts`

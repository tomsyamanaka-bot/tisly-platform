# TiSLY Demo Kit v1 — ESP32-S3 最小デモ

## 構成

| 項目 | 型番例 |
|------|--------|
| MCU | ESP32-S3 DevKit |
| 入力 | 赤外線 PIR ×1、マグネット（ドア）×1、タクトボタン ×1 |
| 出力 | リレー ×1、ステータス LED ×1 |

## デモ顧客

- **Customer Code:** `DEMO001`
- **Site:** `DEMO-HOUSE`
- **ゾーン:** Living / Entrance / Garage
- **仮想 Device ID:** `DEMO-ESP-LIVING`, `DEMO-ESP-ENTRANCE`, `DEMO-ESP-GARAGE`

## ファームウェア概要

1. Wi-Fi 接続後、ポータルで QR Claim 済みの `device_id` を使用
2. `GET /api/customer/DEMO001/devices/{id}/onboard/firmware` で MQTT トピック・間隔を取得
3. トピック `tisly/{site}/esp32/{device_id}/heartbeat` に 60 秒間隔で JSON 送信
4. 入力変化時に `event` チャンネルへ publish（人感・窓開・ボタン）

## 配線（概念）

```
PIR ──► GPIO 4
Magnet ──► GPIO 5 (INPUT_PULLUP)
Button ──► GPIO 0
Relay ──► GPIO 12
LED ──► GPIO 13
```

## サーバー側デモ

`DEMO_MODE=true` または `TISLY_DEMO_MODE=true` で:

- 仮想 ESP の heartbeat（45 秒間隔）
- ランダムイベント（侵入・復旧・停電・通信断・人感・窓開）

## 実機接続前チェック

1. First Device Wizard: `/customer/DEMO001/install/device-onboard`
2. Heartbeat 確認（Step 5）
3. Health Dashboard: `/customer/DEMO001/health`
4. Map Live でピン色（緑/黄/赤）
5. TV: `/tv/DEMO001` — Device Health パネル

## 関連

- `docs/first_real_device_connection_runbook.md`
- `server/src/demo/demo-mode-esp.ts`

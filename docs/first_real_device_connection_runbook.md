# 実機1台接続ランブック（Phase 401–420）

ESP32 / RP2350 / PLC Gateway を 1 台ずつ本番相当で接続する手順です。

## 前提

- 施工 PWA: `https://<host>/customer/<CODE>/install`（HTTPS）
- `.env`: `FIELD_LIVE_MODE=true`, `MQTT_MOCK_MODE=false`, `MQTT_URL` 設定
- ブローカー ACL 準備（`docs/mqtt_acl_ack_field_test.md`）

## 手順

| # | 作業 | API / UI |
|---|------|----------|
| 1 | デバイス作成 | PWA 設備登録 or `POST .../devices/wizard` |
| 2 | QR 発行 | `POST .../devices/qr/create` |
| 3 | Claim | QR スキャン → `POST .../devices/qr/claim` |
| 4 | ファーム設定出力 | `GET .../devices/:id/firmware-config` |
| 5 | 書き込み | USB フラッシュ（ESP32/RP2350）または PLC ダウンロード |
| 6 | MQTT heartbeat | ブローカーで `tisly/{site}/{id}/heartbeat` を確認 |
| 7 | Event test | PWA 通信タブ → Event |
| 8 | Relay test | RP2350/PLC のみ Relay |
| 9 | TV 表示 | `/tv` でサイトイベント表示 |
| 10 | PWA 通知 | Notify テスト + Push 購読 |
| 11 | 完了レポート | `GET .../install/completion-report?locale=ja` |

## デバイス種別

### ESP32

- `firmware-config` の topic / cert を `config.h` に反映
- 書き込み後 Live MQTT: PWA **Live MQTT (ACK)**

### RP2350

- 同上 + Relay テスト必須

### PLC Gateway

- Node-RED ingest + PLC ラダー連携
- `INGEST_SECRET` をゲートウェイに設定

## チェック

- [ ] `GET .../install/field-live-status` で LIVE 表示
- [ ] RTT / ack が mock でない（`mock: false`）
- [ ] 施工写真（before/after/wiring 等）
- [ ] テプラ/Brother CSV 出力
- [ ] 完了レポート PDF/HTML

## 関連

- `docs/installer_final_checklist.md`
- `docs/phase401_420_status.md`

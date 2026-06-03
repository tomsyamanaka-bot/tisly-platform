# Phase 341–360 ステータス

## Installer PWA, QR/NFC Provisioning & Field Setup

### 完了

- [x] 施工 PWA `/customer/:code/install`（タブ UI・縦画面）
- [x] `qr-provisioning.ts` — create / claim（一回限り・期限・顧客スコープ）
- [x] `nfc-provisioning.ts` — UID claim placeholder
- [x] devices: `commissioning_status`, `commissioned_*`, `last_test_result`, `install_note`
- [x] `install-checklist.ts` + API
- [x] 疎通テスト API（heartbeat / event / relay / notification）
- [x] MQTT 診断 `GET .../install/mqtt/:deviceId`
- [x] Map Editor: スナップ・回転・フィルタ・TV/カメラアイコン
- [x] `floorplan-archive.ts` — QNAP mock
- [x] `install_photos` + upload mock
- [x] ラベル API + `device-templates`
- [x] 完了レポート HTML
- [x] `installer` ロール + デモユーザー
- [x] `server/test/installer-provisioning.test.ts`

### 未実装 / TODO

- スマホ NFC Web API
- オフライン同期（キュー flush）
- QR カメラスキャン（html5-qrcode 等）
- 完了レポート PDF
- テプラ / ラベルプリンタ
- MQTT 実 RTT 計測
- QNAP SMB 本番接続

### VPS 前

1. `uploads/floorplans` / `uploads/install-photos` バックアップ
2. 施工担当へ `*.installer` アカウント配布
3. 実機 QR ラベル印刷フロー確認

## Phase 361–380 提案

- html5 QR スキャナ統合
- Service Worker オフライン同期
- Stripe 施工完了トリガー
- 機器証明書（mTLS）プロビジョニング
- 多言語施工 UI

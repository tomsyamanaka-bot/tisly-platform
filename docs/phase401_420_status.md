# Phase 401–420 — Field Device Live Connection & Installer Finalization

| # | 項目 | 状態 |
|---|------|------|
| 1 | Service Worker 同期強化（mqtt test, 写真, UI pending/synced/failed/conflict） | 完了 |
| 2 | MQTT ACK tracker + `POST .../test/live-mqtt` | 完了 |
| 3 | Firmware config export API | 完了 |
| 4 | テプラ/Brother CSV + qr.svg | 完了 |
| 5 | 完了レポート locale=ja/en | 完了 |
| 6 | 施工写真タイプ + ストレージ整理 | 完了 |
| 7 | 実機接続ランブック | 完了 |
| 8 | Installer 最終チェックリスト | 完了 |
| 9 | 施工 PWA UI（次にやること・大ボタン・モードバナー） | 完了 |
| 10 | `.env` FIELD_LIVE_MODE 等 | 完了 |
| 11 | `field-live-connection.test.ts` | 完了 |
| 12 | README Phase 401–420 | 完了 |

## デモ手順

```bash
cd server
cp .env.example .env   # 既存 .env があれば変数のみ追加
npm run build && npm run test
# 施工 PWA: /customer/TOMS001/install
```

## Phase 421–440 候補

- ブローカー ACL 本番テンプレート（Mosquitto / EMQX）
- ACME / 社内 CA 連携（`CERT_PROVISIONING_MODE=ca`）
- S3 本番 dual-write + QNAP ミラー自動化
- テプラ WebLink / Brother b-PAC SDK 組み込み
- Background Sync + JWT リフレッシュ
- 実機 E2E（ESP32 1台）CI スモーク

## 関連

- `docs/first_real_device_connection_runbook.md`
- `docs/installer_final_checklist.md`
- `server/test/field-live-connection.test.ts`

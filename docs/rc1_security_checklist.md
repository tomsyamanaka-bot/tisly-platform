# RC1 Security Checklist（Phase 161–180）

本番・実証運用前にすべて確認してください。

## ネットワーク / TLS

- [ ] HTTPS（リバースプロキシで TLS 終端）
- [ ] MQTT は 8883 TLS（1883 は localhost のみ）
- [ ] 管理画面 URL が HTTPS のみ

## シークレット

- [ ] `JWT_SECRET` — 32 文字以上のランダム値
- [ ] `ADMIN_PASSWORD_HASH` — 平文パスワードを .env に置かない
- [ ] `INGEST_SECRET` — Node-RED と server で一致
- [ ] `VAPID_*` — Push 利用時のみ、未使用なら空で可
- [ ] MQTT `password_file` 設定済み
- [ ] MQTT `acl_file` — device 単位 ACL
- [ ] `.env` が git にコミットされていない

## 認証 / 監査

- [ ] 未認証で `/api/sites/*` 等が 401 になる
- [ ] `POST /api/auth/login` が動作
- [ ] 管理操作が `audit_logs` に残る
- [ ] TV `revoke` 手順を把握（`docs/secret_rotation.md`）

## デバイス / Ingest

- [ ] Device secret は初回のみ平文表示
- [ ] `x-tisly-device-id` + `x-tisly-device-secret` または ingest secret
- [ ] Node-RED debug で secret を出さない
- [ ] 本番 Node-RED で debug ノード無効

## データ保持

- [ ] QNAP retention（30/90/365）方針決定
- [ ] `POST /api/qnap/purge/dry-run` で削除候補確認
- [ ] バックアップ `data/backups/` または QNAP へ日次

## 運用 UI

- [ ] `/operations` Security タブでログイン確認
- [ ] Recovery Console で confirm ダイアログ表示

## テスト

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
```

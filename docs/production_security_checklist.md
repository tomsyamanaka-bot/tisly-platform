# Production Security Checklist — Phase 181-200

本番 VPS / 現場 PoC 投入前の確認リストです。

## データベース

- [ ] `DB_PROVIDER=sqlite`（PoC）または `postgres`（VPS 本番）
- [ ] `npm run db:migrate` 実行済み
- [ ] `npm run db:backup` スケジュール設定
- [ ] PostgreSQL: TLS 接続、`POSTGRES_SSL=true`

## Redis

- [ ] `RATE_LIMIT_PROVIDER=memory`（単一实例 PoC）
- [ ] 本番多实例: `RATE_LIMIT_PROVIDER=redis` + `REDIS_URL`

## 传输層

- [ ] HTTPS 必須（Let's Encrypt）
- [ ] MQTT TLS 8883
- [ ] HSTS 有効 — `docs/tls_ocsp_pinning.md`

## アプリケーションセキュリティ

- [ ] `JWT_SECRET` — `openssl rand -hex 32`
- [ ] `ADMIN_PASSWORD_HASH` 設定
- [ ] `INGEST_SECRET` 本番値（Node-RED 同期）
- [ ] HMAC 署名: 実機デプロイ時 `SIGNATURE_CHECK_ENABLED=true` 検討
- [ ] Replay protection 有効（デフォルト ON）
- [ ] Session revoke 動作確認 — `/api/auth/sessions`
- [ ] 2FA: 本番前に real TOTP へ — `docs/two_factor_auth.md`

## 監査・ログ

- [ ] audit_logs 保持ポリシー
- [ ] SIEM export — `data/siem/` または外部転送
- [ ] ingest 冪等・署名エラー監視 — Operations Security タブ

## インフラ

- [ ] nginx WAF snippets — `server/deploy/nginx/security-snippets.conf`
- [ ] Mosquitto ACL/TLS — `server/deploy/mosquitto/`
- [ ] QNAP retention / purge 設定

## バックアップ

- [ ] `BACKUP_SCHEDULER_ENABLED=true`
- [ ] QNAP オフサイトコピー

## テスト

- [ ] `npm run test` — e2e + security + production-security
- [ ] `docs/pentest_notes.md` 項目実施
- [ ] `docs/security_incident_response.md` 関係者共有

## レガシー経路

- [ ] `POST /api/events/`（認証なし）— 本番で nginx deny 推奨

## 関連ドキュメント

- `docs/rc1_security_checklist.md`（Phase 161-180）
- `docs/postgresql_migration.md`
- `docs/event_signature.md`
- `docs/waf_rules.md`

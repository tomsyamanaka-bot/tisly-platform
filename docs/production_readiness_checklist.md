# Production Readiness Checklist（Phase 121–140）

## ビルド・テスト

- [ ] `cd server && npm run build` 成功
- [ ] `cd server && npm run test` 成功（E2E supertest）
- [ ] `cd tv-app && npx tsc --noEmit` 成功

## 環境

- [ ] `.env` を `.env.example` から作成（本番値、リポジトリにコミットしない）
- [ ] `INGEST_SECRET` を本番用に変更
- [ ] `QNAP_*`（NAS 利用時）

## VPS インフラ

- [ ] nginx リバースプロキシ + HTTPS
- [ ] systemd `tisly` サービス起動
- [ ] Mosquitto 内部リスン（`docs/mqtt_security_acl_tls.md`）

## 機能確認

- [ ] Web Push（VAPID 設定）
- [ ] TV ペアリング（`POST /api/tv/pairing/start` → confirm）
- [ ] MQTT ingest（Node-RED または `MQTT_SUBSCRIBER_ENABLED=true`）
- [ ] Node-RED `tisly_real_device_ingest_v1.json` deploy
- [ ] QNAP `GET /api/qnap/status`（SMB 設定時は実書き込みテスト）
- [ ] Recovery `POST /api/test/recovery`
- [ ] AI Risk `GET /api/analytics/risk`
- [ ] バックアップ（QNAP / ローカル `data/qnap-archive/`）

## デモ機能退避

- [ ] 本番で `TISLY_DEMO_MODE=false`
- [ ] Demo/AI/Recovery 既存 API が regression なし

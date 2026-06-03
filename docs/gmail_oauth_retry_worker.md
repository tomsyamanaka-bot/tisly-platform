# Gmail OAuth Retry Worker（Phase 741–780）

## 概要

Gmail 送信を `gmail_send_queue` に積み、バックグラウンド worker が `pending` → `retrying` → `sent` / `failed` を処理します。

## OAuth 未接続時

`sendMode: mockOnly` — タイムラインに「mockOnly — OAuth未接続時はデモ送信」と記録。

## 環境変数

- `GOOGLE_OAUTH_ENABLED=true` + クライアント資格情報
- `GMAIL_SEND_MODE=real`（本番送信時）

## API

- `GET /api/toms/gmail-send-queue`
- 案件タイムライン: `Gmail 送信待ち` / `再送中` / `送信完了` / `送信失敗`

## Worker

`server/src/workers/gmail-oauth-retry-worker.ts` — `WORKERS_ENABLED` 既定 ON、`WORKER_INTERVAL_MS` で間隔調整。

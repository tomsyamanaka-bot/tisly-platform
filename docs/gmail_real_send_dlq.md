# Gmail 本番送信 + DLQ（Phase 781–820）

## 3 段階ガード

1. `GMAIL_SEND_MODE=mock` — 送信スキップ（integration_logs に skipped）
2. `dryRun` — プレビューのみログ
3. `real` — `GOOGLE_OAUTH_ENABLED` + `confirmed=true` + refresh token 必須

## integration_logs

- 成功 / 失敗 / retry / dead-letter を `business_integration_logs` に記録
- DLQ 登録時は `request.op=dead-letter` と `dlqId`

## DLQ

- テーブル: `gmail_send_dlq`
- API: `GET /api/business/gmail/dlq?projectId=&limit=`
- キュー `GMAIL_QUEUE_MAX_ATTEMPTS` 超過で `enqueueGmailDeadLetter`

## 実装

- `server/src/business/services/gmailRealSend.ts`
- `server/src/business/gmail-dlq.ts`
- `server/src/business/gmail-send-queue.ts`

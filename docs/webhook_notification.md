# Webhook 通知（Phase 261–300）

## プラン制限

`server/src/notification/channel-plan-guard.ts`

| プラン | チャネル |
|--------|----------|
| Lite | なし |
| Standard | email（placeholder） |
| PRO | email, web_push, discord |
| PRO_REMOTE | 上記 + webhook + qnap_archive |

## API

| メソッド | パス |
|----------|------|
| POST | `/api/customer/:code/webhooks` |
| GET | `/api/customer/:code/webhooks` |
| POST | `/api/customer/:code/webhooks/:id/test` |
| DELETE | `/api/customer/:code/webhooks/:id` |

## 実装

- `server/src/notification/channels/webhook.ts`
- 署名（Phase 281+）: `server/src/notification/webhook-signature.ts`
  - `x-tisly-webhook-timestamp` — Unix 秒
  - `x-tisly-webhook-signature` — `v1=<hmac-sha256(timestamp.body)>`
- 再送: `webhook_delivery_logs` · `webhook-retry-queue.ts`（max 5、指数バックオフ）

## 監査

作成・テスト・削除は `audit_logs` に記録。

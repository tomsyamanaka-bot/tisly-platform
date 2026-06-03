# Webhook 通知（Phase 261–280）

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
- シークレットヘッダ: `X-TiSLY-Webhook-Secret`
- リトライ: placeholder（キュー未実装）

## 監査

作成・テスト・削除は `audit_logs` に記録。

# Stripe Billing 連携（Phase 301–320）

## 環境変数

`server/.env.example` 参照:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_LITE` / `STANDARD` / `PRO` / `PRO_REMOTE`

未設定時は **mock モード** — Webhook は署名検証をスキップし、プラン同期のみ実行。

## Webhook

`POST /api/billing/stripe/webhook`

| イベント | 動作 |
|----------|------|
| `customer.subscription.created` | `customers.plan` / `subscription_status` 更新 |
| `customer.subscription.updated` | 同上 |
| `customer.subscription.deleted` | `contract_status=cancelled`, `status=suspended` |
| `invoice.payment_succeeded` | `last_invoice_status=paid` |
| `invoice.payment_failed` | `last_invoice_status=failed`, `subscription_status=past_due` |

## モジュール

- `server/src/billing/stripe-client.ts`
- `billing-store.ts` — DB 永続化
- `plan-sync.ts` — Price ID → プラン
- `stripe-webhook-handler.ts`

## 管理 UI

`/admin/:customerCode` — Billing カード（placeholder、実課金は Stripe 有効化後）

# 契約・請求連携（準備）

## 候補

- **Stripe Billing** — サブスクリプション、プラン変更 Webhook
- 社内請求書 — エンタープライズ向け手動

## プラン（TiSLY PRO Remote）

| プラン | 月額（目安） | 備考 |
|--------|-------------|------|
| Lite | — | ポータル制限 |
| Standard | — | email のみ |
| PRO | — | 通知拡張 |
| PRO_REMOTE | — | Webhook + QNAP |

## 契約状態

- `trial` — 機能制限緩和（TODO）
- `active` — 通常
- `suspended` — ログイン可・書き込み制限（TODO）
- `cancelled` — 読取専用（TODO）

## 実装 TODO

1. Stripe Customer ↔ `customers.stripe_customer_id`
2. Webhook `invoice.paid` / `customer.subscription.deleted`
3. `plan-guard` と契約状態の連動
4. 請求停止時: Webhook 無効、招待不可、レポート export 停止

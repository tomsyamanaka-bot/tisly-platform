# Phase 301–320 ステータス

## 完了

- [x] Stripe billing foundation（mock Webhook）
- [x] Billing 管理タブ placeholder
- [x] notification / webhook / report email ワーカー
- [x] Webhook 再送強化（delivered_at, deliveries API）
- [x] Operations 実データ API + map-builder
- [x] Puppeteer PDF（optional + fallback + audit）
- [x] report_email_queue
- [x] PostgreSQL 移行補助 + runbook
- [x] contract-guard
- [x] ポータル Audit タブ
- [x] Infrastructure ワーカー/Billing 表示
- [x] `billing-worker.test.ts`

## デモ顧客（維持）

| コード | プラン |
|--------|--------|
| TOMS001 | PRO_REMOTE |
| HOTEL001 | PRO |
| PLANT001 | Standard |

## VPS 投入前

1. Stripe 本番キー + Webhook URL 登録
2. SMTP 設定
3. `TISLY_PDF_PUPPETEER` + puppeteer インストール（任意）
4. PostgreSQL 移行 + RLS 適用
5. `WORKERS_ENABLED=true`

## Phase 321–340 提案

- 図面アップロード + 座標エディタ
- Stripe Customer Portal リンク
- ワーカー Redis キュー
- RLS 本番適用 + 負荷試験
- 顧客向け請求履歴 UI

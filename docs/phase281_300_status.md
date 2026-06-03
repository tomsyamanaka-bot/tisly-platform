# Phase 281–300 実装ステータス

## 完了

- 顧客ポータル「通知ルール」タブ（ON/OFF、イベント、severity、チャネル、時間帯、曜日、プラン制限表示）
- `customer-rule-engine.ts` / `customer_notification_rules` テーブル
- `incidents` 統一（`incident-store`, `incident-converter`, `incident-status`）
- Operations 顧客スコープ（`/api/ops/summary`, SOC/NOC `customerCode`）
- PDF レンダラ（HTML placeholder + 任意 Puppeteer）
- `POST .../reports/send-email`（PDF 添付 placeholder、監査ログ、`export_id`）
- `rls.sql` 準備、`customer-context.ts`
- Webhook HMAC 署名ヘッダー、再送キュー `webhook_delivery_logs`
- 招待メールテンプレート、Users タブ再招待
- TV 証明書ピン留め表示（Settings）
- `server/test/pro-remote-operations.test.ts`

## TODO（VPS 前）

- PostgreSQL へ RLS 適用
- Puppeteer 本番依存関係と PDF 品質
- SMTP 本番・招待メール実送信
- Webhook 再送ワーカー常駐化
- ネイティブ TV TLS ピン留め
- Stripe 請求連携（`docs/billing_contract_integration.md`）

## テスト

- `npm run test`: 66 pass（`2fa.test.ts` 含む — 今回の変更と無関係で成功）
- `npx tsc --noEmit`（tv-app）: pass

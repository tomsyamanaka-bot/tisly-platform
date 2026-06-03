# レポートメール配信キュー

## API

`POST /api/customer/:code/reports/send-email`

- `sales_report` プラン必須
- `contract-guard` — suspended/cancelled は 403
- レスポンス `202` + `queue_id`

## フロー

1. レポート HTML 生成 + `recordReportExport`
2. `renderReportPdf`（Puppeteer または HTML fallback）
3. `enqueueReportEmail`
4. ワーカーが `sendReportEmail`（SMTP 未設定時 mock）

## テーブル

`report_email_queue` — `pending` / `sent` / `exhausted`

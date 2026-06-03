# Phase 581–600 — TOMS Business Real Integration & Standard PDF Foundation

## 完了項目

| # | 機能 | 状態 |
|---|------|------|
| 1 | Google OAuth 本番接続 | code 交換・refresh・Calendar/Gmail API（mock 維持） |
| 2 | QNAP WebDAV 実アップロード | PUT/MKCOL/接続テスト・mock/real 切替 |
| 3 | TOMS標準PDF v2 | 会社・明細・税区分・写真・QR/印影 placeholder |
| 4 | 入金→ステータス自動遷移 | paid / partial_paid / invoice_sent |
| 5 | Business Web Push | mock + 既存 notification service |
| 6 | 会計CSV | standard / freee / yayoi |
| 7 | 単価CSV UI | プレビュー・上書き/追加・エラー行 |
| 8 | integration logs | export CSV・purge 90日 |
| 9 | real送信ガード | dry-run / mock only / real send + 確認 |
| 10 | E2E テスト | `business-phase581-e2e.test.ts` |
| 11 | Docs | 本フェーズ配下 md |

## 主要 API

- `POST /api/business/google/calendar/create`
- `POST /api/business/google/gmail/draft`
- `POST /api/business/google/gmail/send`
- `POST /api/business/qnap/test-connection`
- `POST /api/business/projects/:id/qnap/upload-real`
- `GET /api/business/accounting/export-csv?format=standard|freee|yayoi`
- `GET /api/business/integration-logs/export-csv`
- `DELETE /api/business/integration-logs/purge?days=90`
- `PATCH /api/business/settings/real-send`

## Phase 601–620 候補

- Gmail `users.messages.send` 本番送信
- QNAP 実機 E2E（社内 NAS）
- Puppeteer PDF 本番パイプライン固定化
- Business 専用 SW + push 購読 UI
- freee / 弥生 API 連携

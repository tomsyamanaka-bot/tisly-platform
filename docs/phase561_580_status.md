# Phase 561–580 — TOMS Business Production Integration Foundation

## 完了項目

| # | 機能 | 状態 |
|---|------|------|
| 1 | Google/Gmail OAuth (`googleOAuthService.ts`) | mock 稼働、real はトークン交換 TODO |
| 2 | `business_integration_logs` | DB + 全 mock 操作で記録 |
| 3 | QNAP WebDAV 準備 (`qnapBusinessArchive.ts`) | mock → `uploads/qnap-mock/{projectId}` |
| 4 | TOMS 標準 PDF (`server/src/business/pdf/`) | HTML テンプレ + 任意 Puppeteer |
| 5 | 単価 CSV import/export | API + `/business/pricing` UI |
| 6 | `business_payments` + 会計 CSV | API + 入金画面 |
| 7 | Survey「TOMS案件を作成」 | `POST /api/business/from-survey/:id` |
| 8 | Offline sync | `POST /api/business/offline/sync` |
| 9 | Business PWA UI | ホームカード、設定、キュー同期 |
| 10 | Docs | 本フェーズ配下 md |
| 11 | Tests | `business-*.test.ts` 8 本追加 |

## 環境変数

`server/.env.example` の Phase 561–580 セクションを参照。

## Phase 581–600 候補

- Google OAuth 実トークン交換・Calendar/Gmail API 送信
- QNAP WebDAV 実アップロード
- Puppeteer 本番 PDF パイプライン
- 入金と案件ステータス自動連動
- Business PWA プッシュ通知

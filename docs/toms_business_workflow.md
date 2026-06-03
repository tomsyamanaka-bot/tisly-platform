# TOMS Business Workflow (Phase 541–560)

## フロー

`new` → `survey_scheduled` → `survey_done` → `estimate_created` → `estimate_sent` → `construction_scheduled` → `construction_done` → `completion_report_created` → `invoice_created` → `invoice_sent` → `paid` → `closed`

## API

| 操作 | メソッド |
|------|----------|
| ステータス変更 | `POST /api/business/projects/:id/status` |
| 現調カレンダー | `POST .../calendar/site-survey` |
| 工事カレンダー | `POST .../calendar/construction` |
| 入金カレンダー | `POST .../calendar/payment` |
| 見積メール | `POST .../mail/estimate-ready` |
| 完了報告メール | `POST .../mail/completion-ready` |
| 請求メール | `POST .../mail/invoice-ready` |
| QNAP保存 | `POST .../qnap/save` |
| Survey連携 | `POST /api/business/from-survey/:surveyProjectId` |

## PWA

- `/business` — ダッシュボード・今日の予定
- オフラインキュー: `localStorage` `tisly_business_offline_queue_v541`
- Service Worker: `/sw-business.js`

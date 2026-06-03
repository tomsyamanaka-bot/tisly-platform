# Business Web Push（mock）

`server/src/business/business-notifications.ts`

## 通知対象（アラート収集）

- 入金待ち（`invoice_sent`）
- 見積未送信（`estimate_created`）
- Google 連携エラー（real 未接続）
- QNAP / PDF の直近 integration log エラー

## API

- `GET /api/business/notifications/alerts`
- `POST /api/business/notifications/push-mock` — 既存 `sendWebPush`（VAPID 未設定時はログのみ成功扱い）

Business PWA 専用 SW は Phase 601+ 候補。

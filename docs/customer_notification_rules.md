# 顧客通知ルール

## UI

顧客ポータル `/customer/:code` → タブ「通知ルール」。

## API

- `GET /api/customer/:code/notification-rules` — ルール一覧 + `planLimits`
- `POST` — manager+、プラン検証
- `PATCH /:id` — 更新
- `DELETE /:id` — admin+

## プランとチャネル

| プラン | チャネル |
|--------|----------|
| Lite | なし |
| Standard | email |
| PRO | email, web_push, discord |
| PRO_REMOTE | 上記 + webhook, qnap_archive |

実装: `server/src/notification/customer-rule-engine.ts`

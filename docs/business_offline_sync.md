# Business Offline Sync

## API

`POST /api/business/offline/sync`

```json
{
  "items": [
    { "type": "project_create", "payload": { "customerId": "...", "customerName": "...", "title": "..." } }
  ]
}
```

## 対応 type

- project_create
- photo_memo
- status_change
- estimate_item
- invoice_memo
- payment_memo

レスポンス: `{ synced, failed, skipped }`

PWA は `tisly_business_offline_queue_v541` をバッチ同期（`business.js`）。

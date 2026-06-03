# Notification Center

## API

- `GET /api/toms/projects/:id/notifications`
- `POST /api/toms/projects/:id/notifications/:notificationId/ack`

## 種別

未確認アラート、見積未送信、請求未送信、入金待ち、保守期限、ESP/Shelly/カメラ異常

## 永続化

`toms_project_notifications` — 派生通知を upsert、確認で `acknowledged=1`

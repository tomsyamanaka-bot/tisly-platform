# PRO Remote 双方向 WebSocket（Phase 741–780）

## 概要

`/ws` でクライアント → サーバー → 全購読クライアントへ PRO Remote 操作をミラーします。

## 送信形式

```json
{
  "type": "pro_remote",
  "projectId": "BIZ-…",
  "action": "floor_nav|pin_select|ack|close|escalate",
  "tier": "1f",
  "pinId": "…",
  "notificationId": "…",
  "actor": "dashboard"
}
```

## 受信

`payload.channel === "pro_mirror"` — フロアジャンプ・ピン blink・通知ハイライト

## タイムライン

各操作は `pro_operations` として案件タイムラインに記録されます。

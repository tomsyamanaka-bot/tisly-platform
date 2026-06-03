# Demo Notifications（Phase 821–860）

## 概要

営業画面 `/sales` または API から **1ボタン** でデモ通知を発火します。

## 種別

| kind | 内容 |
|------|------|
| intrusion | 侵入 |
| power_outage | 停電 |
| esp_fault | ESP 異常 |
| shelly_fault | Shelly 異常 |
| maintenance_due | 保守期限 |

## 反映先

1. **WebPush** — `sendWebPush()`（未設定時は mock 応答）
2. **Timeline** — `events` + `device_timeline`
3. **PRO Remote** — `pro_operations`（`floor_nav`）

## API

```http
POST /api/demo-kit/notifications/intrusion
Content-Type: application/json

{ "customerCode": "TOMS001" }
```

## 実装

- `server/src/demo-kit/demo-notifications.ts`

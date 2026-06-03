# QR デバイスプロビジョニング

## QR JSON（v2）

```json
{
  "v": 2,
  "device_id": "TOMS-ESP-01",
  "device_type": "ESP32",
  "serial_number": "SN001",
  "provisioning_token": "<secret>",
  "expires_at": "2026-06-04T12:00:00.000Z",
  "customer_id": "cust-toms"
}
```

## API

| Method | Path |
|--------|------|
| POST | `/api/customer/:code/devices/qr/create` |
| POST | `/api/customer/:code/devices/qr/claim` |

## ルール

- トークンは DB に hash のみ保存
- **1 回限り**（`used_at`）
- **期限切れ拒否**
- **顧客 ID 不一致拒否**
- tenant guard + plan guard + rate limit + audit log

## 実装

`server/src/provisioning/qr-provisioning.ts`

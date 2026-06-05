# QR Management（設備管理QR）

## QR ペイロード

```json
{
  "v": 3,
  "assetId": "AST-ABCD1234",
  "customerCode": "TOMS003",
  "siteId": "site-...",
  "deviceId": "TOMS003-ESP-...",
  "url": "https://host/asset/AST-ABCD1234"
}
```

## 読み取り後

`/asset/:assetId` で以下を表示:

- 設備詳細
- 図面（floors / floor_maps）
- 施工写真（install_photos）
- 保守履歴（maintenance_cases）

API: `GET /api/deployment-kit/assets/:assetId`

# NFC デバイスプロビジョニング（placeholder）

## 現状

施工 PWA で **NFC UID 文字列**を手入力し claim します。

```
POST /api/customer/:code/devices/nfc/claim
{ "nfcUid": "04:A1:B2:C3", "siteId": "...", "floorId": "..." }
```

## 将来 TODO

- Web NFC API（Android Chrome）
- NTAG / Mifare UID と device_id のマッピングテーブル
- タップで QR 相当の claim フロー

## 実装

`server/src/provisioning/nfc-provisioning.ts`

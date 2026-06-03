# NFC デバイスプロビジョニング（Phase 361–380）

## 対応ブラウザ

`window.NDEFReader` が利用可能な場合（主に Android Chrome）:

- 施工 PWA に **NFCタグを読む** ボタンを表示
- 読み取った `serialNumber` を UID として claim

非対応端末:

- **NFC UID 手入力**（mock UID 可）

## API

```
POST /api/customer/:code/devices/nfc/claim
{ "nfcUid": "04:A1:B2:C3", "siteId", "floorId", "deviceId?", ... }
```

## ドライラン

ヘッダ `X-TiSLY-Dry-Run: 1` または PWA のドライラン — DB 更新なし、audit のみ。

## 実装

- `server/src/provisioning/nfc-provisioning.ts`
- `server/public/js/installer-mode.js` — `setupNfcUi()` / `readNfcTag()`

## 将来

- NTAG マッピングテーブル
- タップ → QR 相当ワンショット claim

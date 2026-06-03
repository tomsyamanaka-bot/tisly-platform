# デバイスラベル / QR 印刷

## API

`GET /api/customer/:code/devices/:id/label`

## レスポンス

- `deviceId`, `serial`, `site`, `zone`
- `qrPayload` — 新規 QR トークン付き JSON
- `labelText` — テプラ用 1 行テキスト

## 将来 TODO

- テプラ WebLink / Brother b-PAC
- PDF シート（A4 24面）
- 現場プリンタ Bluetooth

## フロー

1. claim 完了後に label API を呼ぶ
2. QR を SVG/PNG 化（既存 `buildQrSvg` 流用可）
3. 貼付 → Map 配置 → 疎通テスト

# Asset Master (Phase 621–660)

## 設備種別

ESP、Shelly、カメラ、NVR、ルーター、センサー、ライト、PLC、その他。

## API

| 操作 | メソッド |
|------|----------|
| 一覧 | `GET /api/toms/assets` |
| 案件別 | `GET /api/toms/projects/:id/assets` |
| 登録 | `POST /api/toms/assets` |
| QR PNG | `GET /api/toms/assets/:id/qr.png` |

## ページ

`/asset/:assetId` — 設備詳細・QR表示  
`/asset/:assetId?qr=token` — QR読取後の履歴・図面・写真

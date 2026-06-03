# ラベルプリンタ / テプラ・Brother 連携（Phase 401–420）

## API

| 用途 | エンドポイント |
|------|----------------|
| 一括 CSV（汎用） | `GET /api/customer/:code/devices/labels.csv` |
| **テプラ WebLink 向け** | `GET /api/customer/:code/devices/labels/tepra.csv` |
| **Brother b-PAC 向け** | `GET /api/customer/:code/devices/labels/brother.csv` |
| 単体ラベル SVG | `GET /api/customer/:code/devices/:id/label.svg` |
| **QR 中心 SVG** | `GET /api/customer/:code/devices/:id/qr.svg` |
| JSON + QR payload | `GET /api/customer/:code/devices/:id/label.json` |

## テプラ CSV 列

`tape_width_mm, line1, line2, qr_payload, device_id`

## Brother CSV 列

`ObjectName, Text, QRData, Serial, Site, Zone`

## 施工 PWA

完了タブから **テプラ CSV** / **Brother CSV** / **QR SVG** リンクを開けます。

## 対応候補（Phase 421+）

- テプラ WebLink SDK — ブラウザから直接印刷
- Brother b-PAC — ActiveX / ローカルエージェント
- QR 実画像 — `qrcode` ライブラリで SVG 埋め込み

## 実装

- `server/src/installer/device-label-export.ts` — `buildTepraLabelsCsv`, `buildBrotherLabelsCsv`, `buildDeviceQrSvg`

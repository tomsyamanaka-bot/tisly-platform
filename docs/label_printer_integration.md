# ラベルプリンタ / テプラ連携準備（Phase 361–380）

## API

| 用途 | エンドポイント |
|------|----------------|
| 一括 CSV | `GET /api/customer/:code/devices/labels.csv` |
| 単体 SVG | `GET /api/customer/:code/devices/:id/label.svg` |
| JSON + QR payload | `GET /api/customer/:code/devices/:id/label` |

## 対応候補（将来）

- テプラ PC ソフト — CSV インポート
- Brother P-touch — CSV / 画像
- QR 画像 — SVG / PNG エクスポート
- クラウド印刷 API — 未接続

## CSV 列

`device_id, serial, label, device_type, site_id, zone_id, cert_status, trust_level`

## 実装

- `server/src/installer/device-label-export.ts`

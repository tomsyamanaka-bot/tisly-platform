# Operations 実データマップ

## API（管理者 JWT + customerCode 必須）

| エンドポイント | データ源 |
|----------------|----------|
| `GET /api/ops/map?customerCode=` | sites / zones / devices |
| `GET /api/ops/alarms?customerCode=` | events（セキュリティ種別） |
| `GET /api/ops/devices?customerCode=` | devices |
| `GET /api/ops/tv?customerCode=` | tv_devices |
| `GET /api/ops/qnap?customerCode=` | qnap_archives |

`customerCode=ALL` は **400**（地図 API は単一顧客必須）。

## ビルダー

`server/src/ops/map-builder.ts`

- 座標未設定時は placeholder（lat/lng）
- `floorPlanUploadTodo` — Phase 321+ で図面アップロード

## UI

`/operations` — 顧客スコープ選択時は実 API、ALL 時はデモ API フォールバック

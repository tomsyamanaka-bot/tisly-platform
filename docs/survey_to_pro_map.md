# Survey → PRO Floor Map

## API

`POST /api/survey/:projectId/generate-floor-map`

## 処理

1. 顧客の `pro_floor_layers` を idempotent に確保（`ensureProFloorLayersSeed`）
2. 写真・図面を tier にマッピング
   - `aerial` / `outside` → `perimeter`（外周）
   - `inside` / `route` 等 → `1f`
   - 追加階は `2f` のみ
3. `floorplans` / `floors` / `floor_maps` を更新
4. `survey_floor_map_links` に連携記録

## 重要制約

- **屋上フロアは作成しない**
- 標準 tier: `perimeter` / `1f` / `2f`（表示名: 外周 / 1F / 2F）
- 表示順: `sort_order` 0 → 1 → 2

## 表示

`/customer/:code/pro-remote` — 縦スクロール UI（`pro-remote-floor-map.js`）

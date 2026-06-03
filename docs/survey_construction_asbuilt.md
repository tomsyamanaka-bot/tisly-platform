# Survey → Construction → As Built 差分

## API

`GET /api/toms/projects/:id/drawing-diff`

## 図面バージョン

`business_drawing_versions.devices_json` に機器一覧（id, label, assetType, posX, posY）

## 差分

- **追加** — 完成図にのみ存在
- **削除** — ベース図にのみ存在
- **位置変更** — 同一 id で pos が 2% 超変化

## UI

案件ダッシュボードの 3 タブ（現調 / 施工 / 完成）+ 差分一覧

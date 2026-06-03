# Realtime Device Dashboard

## API

`GET /api/toms/projects/:id/devices/live`

## 返却フィールド

`device_id`, `device_type`, `name`, `status` (ONLINE/WARNING/OFFLINE), `last_seen`, `floor`, `zone`, `pos_x`, `pos_y`, `battery`, `rssi`, `firmware_version`

## データソース

`devices` テーブル + `floors` / `zones` 参照。顧客コードは案件から `TOMS001` 等に解決。

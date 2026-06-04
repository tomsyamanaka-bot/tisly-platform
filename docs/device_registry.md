# Device Registry（Phase 902）

## 画面

`/devices` — Device ID・名称・種別（ESP / Shelly / Camera / PLC）・状態（ONLINE / WARNING / OFFLINE）・最終通信

## API

`GET /api/demo-kit/devices/registry?customerCode=TOMS001`

## 種別判定

`device_type` と `device_id` から自動推論（`device-adapter.ts`）。

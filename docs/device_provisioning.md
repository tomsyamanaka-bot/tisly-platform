# Device Provisioning（設備登録）

## URL

- UI: `/device/provision`
- API: `POST /api/deployment-kit/devices/provision`

## 入力

- `customerCode`, `siteId`, `name`, `location`, `kind`（ESP / Shelly / Camera / PLC）
- `deviceId`（任意 — 未指定時は自動生成）

## 保存後

- `devices` テーブル登録
- `deployment_assets` に資産ID（`AST-XXXXXXXX`）作成
- QR SVG / DataURL 返却

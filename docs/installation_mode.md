# Installation Mode（施工モード強化）

Phase 1001–1040 で追加した施工記録 API:

- `POST /api/deployment-kit/install/step`
  - `placement` — 設置完了
  - `photo` — 写真添付
  - `test` — 試験完了
  - `sign` — サイン
  - `gps` — GPS 座標

既存施工 PWA: `/customer/:code/install/home`

ダッシュボード: `GET /api/deployment-kit/install/:customerCode/dashboard`

`commissioning_status` が `placed` → `tested` → `completed` に遷移します。

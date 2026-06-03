# Phase 321–340 ステータス

## Site Builder & Deployment Foundation

### 完了

- [x] `server/src/site-builder/` — site / floor / zone / map stores
- [x] DB: `floors`, `floor_maps`, `camera_devices`, `customer_schedules`, `customer_recovery_rules`
- [x] devices: `pos_x`, `pos_y`, `icon_type`, `rotation`, `floor_id`, `zone_id`, `rssi`
- [x] API: `/api/site`, `/api/floor`, `/api/zone`, `/api/map`（管理）
- [x] 顧客 API: map devices, floors upload, install, wizard, cameras, schedules, recovery-rules
- [x] Map Editor UI `/customer/:code/map`
- [x] Installer Mode `/customer/:code/install`
- [x] Floor upload → `uploads/floorplans`（base64 JSON、QNAP移行前提）
- [x] Customer wizard `POST /api/customers/wizard`
- [x] Operations map 実座標（`dataSource: real`）
- [x] Incident `mapLocation` + `mapJumpUrl`
- [x] Notification / Recovery / Schedule GUI（ポータルタブ）
- [x] PostgreSQL `schema-phase-321.postgres.sql`
- [x] `server/test/site-builder.test.ts`

### VPS 投入前

1. 図面ファイルのバックアップ（`uploads/floorplans`）
2. PostgreSQL へ Phase321 スキーマ適用
3. 本番 Stripe / SMTP（Phase 301–320 継続）
4. `DB_PROVIDER=postgres` + RLS 適用

## Phase 341–360 提案

- Stripe Customer Portal リンク
- ワーカー Redis キュー
- 図面の QNAP SMB 自動同期
- 顧客向け請求履歴 UI
- Map Editor: 回転ハンドル・スナップグリッド
- モバイル施工アプリ（PWA offline）

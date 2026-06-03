# Phase 221–240 — TiSLY PRO Remote

最終更新: 2026-06-03

## 概要

Production Infrastructure Foundation（Phase 201–220）完了後、PRO Remote の顧客管理・マルチテナント・顧客別 URL・権限・Google TV・顧客ダッシュボードを実装。

## データベース

| テーブル | 説明 |
|---------|------|
| `customers` | `customer_id`, `customer_code`, `customer_name`, `plan`, `status` |
| `customer_branding` | `logo_url`, `company_color`, `company_name` |
| `customer_users` | 顧客別ログイン・ロール |
| `sites` 拡張 | `customer_id`, `timezone` |
| `devices` 拡張 | `customer_id`, `site_id`, `serial_number`, `firmware_version`, `last_seen` |

スキーマ: `server/src/db/schema-phase-221.sql`  
マイグレーション: `server/src/db/migrate.ts`（sites/devices 列追加）

## デモ顧客

| コード | プラン | ログイン例 |
|--------|--------|------------|
| TOMS001 | PRO_REMOTE | `toms001.viewer` |
| HOTEL001 | PRO | `hotel001.manager` |
| PLANT001 | Standard | `plant001.admin` |

パスワード（デモ）: `CUSTOMER_DEMO_PASSWORD` または `demo-remote-2026`

## URL

| パス | 画面 |
|------|------|
| `/customer` | 顧客一覧 |
| `/customer/{code}` | 顧客ダッシュボード |
| `/tv/{code}` | Google TV Web ダッシュボード |
| `/admin/{code}` | 顧客管理 |

## API

| メソッド | パス | 認証 |
|---------|------|------|
| POST | `/api/auth/customer/login` | なし |
| GET | `/api/customers` | super_admin |
| GET | `/api/customers/by-code/:code` | viewer+ |
| GET | `/api/customer/:code/dashboard` | viewer+ |
| GET | `/api/customer/:code/devices` | viewer+ |
| GET | `/api/customer/:code/tv` | viewer+ |
| GET | `/api/health/full` | なし |

## JWT ロール

`super_admin` · `admin` · `manager` · `viewer`（階層 RBAC）

## ER 図

`docs/er_phase221.md`

## 次 Phase 候補

- Phase 241–260: TV 証明書本番保存・cert pinning
- PostgreSQL `customers` / `sites` 完全移行
- 顧客別通知ルール・請求連携

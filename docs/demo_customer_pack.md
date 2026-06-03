# Demo Customer Pack（Phase 821–860）

## 概要

営業・デモ用に次の5顧客を idempotent にシードします。

| コード | 名称 | プラン |
|--------|------|--------|
| TOMS001 | トムズ設備デモ | PRO_REMOTE |
| TOMS002 | トムズ設備デモ（第2拠点） | PRO_REMOTE |
| TISLY-DEMO | TiSLY 統合デモ | PRO_REMOTE |
| MINPAKU-DEMO | 民泊セキュリティデモ | PRO |
| FACTORY-DEMO | 工場監視デモ | Standard |

## 各顧客に含まれるもの

- 現場（`sites`）
- ESP / Shelly / カメラ / Gateway（`devices`, `camera_devices`）
- 現調プロジェクト・写真・図面（`survey_*`）
- 通知履歴（`notification_logs`, `device_timeline`）

## API

- `GET /api/demo-kit/status` — 顧客パック状況
- `POST /api/demo-kit/reset` — 全デモデータ再生成

## 実装

- `server/src/demo-kit/demo-customer-pack.ts`
- 起動時: `server/src/index.ts` の `ensureDemoKit()`
- ログイン: `{code}.manager` / `CUSTOMER_DEMO_PASSWORD`（既定 `demo-remote-2026`）

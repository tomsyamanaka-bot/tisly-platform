# tisly.jp 本番 URL 構成（Phase 1201–1240 RC2）

1案件フロー **現調 → AI見積 → Business → 施工 → PRO Remote → Google TV → 引き渡し** を
本番ドメインで辿るための URL 一覧です。

ベース URL: `https://tisly.jp`（`TISLY_PUBLIC_URL`）

## RC2 必須ルート

| パス | 用途 | PWA / HTML | 関連 API |
|------|------|------------|----------|
| `/app` | App Hub — 全ロール入口 | `app-hub.html` | `GET /api/pwa/hub` |
| `/survey` | 現調 PWA | `survey.html` | `POST /api/survey/*` · `POST /api/ai/survey-analysis-v2` |
| `/business` | TOMS 営業・見積 | `business.html` | `GET/POST /api/business/*` |
| `/sales` | 営業デモ（Mock/Real 切替） | `sales.html` | `GET /api/demo-kit/*` |
| `/customer/:code` | 顧客ポータル | `customer-portal.html` | `GET /api/customer/:code/*` |
| `/customer/:code/pro-remote` | PRO Remote 監視 | `pro-remote.html` | `GET .../floor-stack?rc=2` · `POST .../focus` |
| `/customer/:code/install/home` | 施工 PWA | `installer-home.html` | `POST /api/customer/:code/install/*` |
| `/tv/:code` | Google TV Web ダッシュボード | `tv-dashboard.html` | `GET /api/tv/:code/state` · `POST /api/tv/focus-camera` |
| `/deployment/checklist` | 導入チェックリスト（一覧） | `deployment-checklist.html` | `GET /api/deployment/checklist/*` |

`:code` は顧客コード（デモ: `TOMS001`）。

## デモ確認 URL（TOMS001）

```
https://tisly.jp/app
https://tisly.jp/survey
https://tisly.jp/business
https://tisly.jp/sales
https://tisly.jp/customer/TOMS001
https://tisly.jp/customer/TOMS001/pro-remote
https://tisly.jp/customer/TOMS001/install/home
https://tisly.jp/tv/TOMS001
https://tisly.jp/deployment/checklist
```

案件別 RC2 チェックリスト: `/deployment/checklist/:projectId`（例: `BIZ-...`）

## インフラ URL

| URL | 用途 |
|-----|------|
| `https://tisly.jp/api/*` | REST API |
| `wss://tisly.jp/ws` | WebSocket（PRO Remote / TV / 営業デモ） |
| `https://tisly.jp/health` | 簡易ヘルス JSON |
| `GET /api/health/full` | インフラ詳細ヘルス |

MQTT（`MQTT_URL`）は **VPS 内部のみ**（`127.0.0.1:1883`）。外部公開しない。

## nginx ルーティング

`server/deploy/nginx/tisly.jp.conf` がリバースプロキシテンプレートです。

- `/api/` → Node.js `:3080`
- `/ws` → WebSocket アップグレード
- `/` → PWA 静的 + HTML ルート（Express が配信）

## ソースオブトゥルース

ルート定義は `server/src/config/production-routes.ts`（テストと同期）。
Express 実装は `server/src/app.ts`。

## 初回公開（Phase 1281–1290）

必須 5 URL:

- https://tisly.jp/app
- https://tisly.jp/survey
- https://tisly.jp/business
- https://tisly.jp/sales
- https://tisly.jp/customer/TOMS001

監査 API: `GET /api/pwa/publish-audit` · UI: `/app` 本番公開チェックカード

## 関連ドキュメント

- `docs/phase1281_1290_status.md` — 初回公開固定化サマリ
- `docs/tisly_jp_deploy_runbook.md` — VPS デプロイ手順
- `docs/rc2_pre_deploy_checklist.md` — 公開前チェックリスト
- `docs/mock_real_modes.md` — Mock/Real 切替一覧

# TiSLY Platform

**電気工事会社のOS** — 現調・見積・請求・ナレッジ・IoT・監視までを内包する次世代統合プラットフォーム（TiSLY / TOMS IoT Security Layer）のモノレポです。

本番: [https://tisly.jp](https://tisly.jp)（ConoHa VPS）  
社内入口: `/app` · お客様入口: `/customer`

---

## 5分でわかる構成

| 領域 | 説明 |
|------|------|
| **アプリ本体** | `server/` — Express + TypeScript API、PWA 静的ファイル、PDF 生成、DB |
| **フロント** | `server/public/` — HTML/JS/CSS（Next.js/Vite ではない） |
| **Google TV** | `tv-app/` — Expo React Native（表示専用） |
| **IoT** | `rp2350/` · `esp32/` · MQTT · PLC テンプレ |
| **ドキュメント** | `docs/` — 設計・運用・自走開発ガイド |
| **PLC デモ** | `ladder/` — FX 系防犯ラダー（展示用） |

> Cursor で自走開発する場合は最初に [`docs/autonomous/README.md`](docs/autonomous/README.md) と [`docs/autonomous/PROJECT_STATUS.md`](docs/autonomous/PROJECT_STATUS.md) を読んでください。

---

## 技術スタック

| 層 | 技術 |
|----|------|
| ランタイム | Node.js 20+ |
| API | Express 4 · TypeScript 5 |
| DB | SQLite（開発）/ PostgreSQL（本番準備） |
| キャッシュ | Redis（オプション） |
| PDF | Puppeteer（本番）/ HTML フォールバック |
| PWA | 素の HTML + ES Modules + Service Worker |
| 通知 | Web Push（VAPID） |
| IoT | MQTT · RP2350 MicroPython · ESP32 |
| ストレージ | ローカル `uploads/` + QNAP WebDAV バックアップ |
| デプロイ | GitHub Actions → VPS 自動更新 |

---

## クイックスタート

```bash
cd server
cp .env.example .env
npm install
npm run vapid:setup    # 初回のみ
npm run db:init
npm run dev            # http://localhost:3080
```

| コマンド（ルート） | 説明 |
|-------------------|------|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | TypeScript ビルド |
| `npm run demo` | デモデータ投入 + 起動 |

| コマンド（`server/`） | 説明 |
|----------------------|------|
| `npm run test` | 全テスト |
| `npm run release:gate` | build + test + deploy 検証 |

ログイン例: `TOMS001` / `toms001.surveyor`（`.env` の `CUSTOMER_DEMO_PASSWORD`）

---

## 主要 URL（ローカル / 本番共通パス）

| 用途 | パス |
|------|------|
| App Hub（社内） | `/app` |
| お客様ポータル | `/customer` |
| 日程調整 | `/schedule-v1` |
| 現調 | `/survey-v1` |
| 見積・請求 | `/estimate-v1` |
| 案件センター | `/projects-v1` |
| 案件詳細 | `/project-mgmt-detail-v1?projectId=` |
| 書類閲覧 | `/document-viewer-v1.html` |
| 監視 3D | `/monitoring-3d-v2` |
| Remote Test（RP2350） | `/remote-test` |
| 設定 | `/settings-v1` |
| Route Health | `/route-health` |

---

## ディレクトリ構成（抜粋）

```
TiSLY_HOME_Security_DEMO/
├── README.md                 ← このファイル
├── docs/
│   ├── TISLY_MASTER_VISION.md   思想・ロードマップ
│   ├── ARCHITECTURE.md          システム構成・データフロー
│   └── autonomous/              自走開発（PROJECT_STATUS 等）
├── server/                   ← 本番デプロイ対象
│   ├── src/                  API・ビジネスロジック
│   ├── public/               PWA（HTML/JS/CSS）
│   ├── test/                 自動テスト
│   └── uploads/              案件 PDF・写真（Git 外）
├── tv-app/                   Google TV アプリ
├── rp2350/                   RP2350 ファームウェア
├── scripts/                  デプロイ・QNAP 同期
└── ladder/                   PLC デモラダー
```

---

## 主要機能（コード参照）

| 機能 | パス |
|------|------|
| PDF 共有（files-only） | `server/public/js/pdf-share-v1.js` |
| 戻るナビスタック | `server/public/js/tisly-navigation-stack-v1.js` |
| 仕様書 PDF | `server/src/estimate/specification-template.ts` |
| Google Calendar | `server/src/api/routes/google-calendar.ts` |
| 天気（Open-Meteo） | `server/src/schedule/weather-service.ts` |
| QNAP バックアップ | `server/src/storage/qnap-pdf-backup-service.ts` |
| RP2350 遠隔操作 | `server/src/api/routes/remote-test.ts` · `rp2350/firmware/` |
| お客様ポータル | `server/src/customer-portal/` |

---

## VPS デプロイ

`master` へ push → GitHub Actions → ConoHa VPS 自動更新。

成功確認: https://tisly.jp/api/health の `commitShort` が push した commit の先頭 7 文字と一致。

詳細: [`docs/autonomous/VPS_AUTO_DEPLOY.md`](docs/autonomous/VPS_AUTO_DEPLOY.md)

---

## ドキュメント索引

| ドキュメント | 内容 |
|-------------|------|
| [`docs/TISLY_MASTER_VISION.md`](docs/TISLY_MASTER_VISION.md) | 絶対的思想・Phase ロードマップ |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | システム構造・データフロー |
| [`docs/tisly_core_policy.md`](docs/tisly_core_policy.md) | PWA 中心・通知方針 |
| [`docs/autonomous/PROJECT_STATUS.md`](docs/autonomous/PROJECT_STATUS.md) | 完成仕様（壊してはいけないもの） |
| [`docs/mothership.md`](docs/mothership.md) | QNAP MotherShip 運用 |
| [`server/README.md`](server/README.md) | サーバー詳細 |

---

## ライセンス / 注意

デモ・評価・実務 PWA 開発用リポジトリです。本番 `.env` に秘密情報をコミットしないでください。

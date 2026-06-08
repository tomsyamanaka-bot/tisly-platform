# 現在の状態（2026-06-08）

## コード状態（origin/master）

| 項目 | 値 |
|------|-----|
| 最新コミット | `29d58cf` — Add schedule planner and repair practical PWA workflow |
| ローカル build | ✅ `npm run build` 成功 |
| 単体テスト | ✅ schedule-v1 / survey-v1 / estimate-v1 / multi-pwa-app-hub 全 PASS |

## 本番 VPS 状態（2026-06-08 確認）

| 項目 | 値 |
|------|-----|
| 稼働コミット | `d721f45`（`/api/health` の buildVersion） |
| 必要アクション | **VPS で pull → build → restart**（未実施） |
| Cursor から SSH | `tisly.jp:22` / `:2222` ともタイムアウト → **人間が SSH または ConoHa VNC** |

### 本番 URL 応答（デプロイ前）

| URL | HTTP | 備考 |
|-----|------|------|
| `/app` | 200 | 旧版ナビ（日程調整なし） |
| `/survey-v1` | 200 | 静的ページのみ、API 未搭載 |
| `/estimate-v1` | 200 | 同上 |
| `/schedule-v1` | **404** | 未デプロイ |
| `/api/schedule/v1/*` | **404** | 未デプロイ |
| `/api/survey/v1` | **404** | 未デプロイ |
| `/api/estimate/v1` | **404** | 未デプロイ |

本番の `tisly-practical-nav.js` は旧版（アプリ一覧→現調→見積→準備中×3）。  
`29d58cf` 反映後は **日程調整→現調→見積→請求→案件一覧** に変わる。

## 完了（今回 — Schedule Planner 統合）

- **日程調整 PWA** (`/schedule-v1`) — 週間カード・3週間・月間・空き度・現場不可日・週間サマリー
- **下部ナビ変更** — 日程調整 → 現調 → 見積 → 請求 → 案件一覧（`tisly-practical-nav.js`）
- **Google Calendar 準備** — `server/src/services/googleCalendar.ts`（モック）、`schedule-store.ts`、API `/api/schedule/v1`
- **見積番号** — 新規は `YYMMDD-001`（既存データは維持）
- **見積ヘッダー整理** — 「工事場所」のみ、住所・電話・メール追加
- **文言変更** — 「社内用データを確認」
- **検索準備** — `search_index_json` 列 + `estimate-v1-search.ts`
- **現調写真修正** — Safari対応圧縮、即プレビュー、最大30枚・表示12枚
- **401 表示** — `tisly-friendly-errors.js` で「ログインが切れました」

## 本番反映後の確認用 URL

- https://tisly.jp/app
- https://tisly.jp/schedule-v1
- https://tisly.jp/survey-v1
- https://tisly.jp/estimate-v1

## ログイン（デモ）

- 会社コード: `TOMS001`
- ユーザー: `toms001.surveyor`
- パスワード: `.env` の `CUSTOMER_DEMO_PASSWORD`（本番ログイン検証済み: 200）

## 人間作業

→ [HUMAN_TODO.md](./HUMAN_TODO.md)（**VPS デプロイが最優先**）

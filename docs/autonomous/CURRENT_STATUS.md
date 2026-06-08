# 現在の状態（2026-06-08）

## 完了（今回 — Schedule Planner 統合）

- **日程調整 PWA** (`/schedule-v1`) — 週間カード・3週間・月間・空き度・現場不可日・週間サマリー
- **下部ナビ変更** — 日程調整 → 現調 → 見積 → 請求 → 案件一覧（`tisly-practical-nav.js`）
- **Google Calendar 準備** — `server/src/services/googleCalendar.ts`（モック）、`schedule-store.ts`、API `/api/schedule/v1`
- **見積番号** — 新規は `YYMMDD-001`（既存データは維持）
- **見積ヘッダー整理** — 「工事場所」のみ（現場名ラベル削除）、住所・電話・メール追加
- **文言変更** — 「社内用データを確認」（お客様には見せない旨の説明付き）
- **検索準備** — `search_index_json` 列 + `estimate-v1-search.ts`
- **現調写真修正** — Safari対応圧縮、即プレビュー、最大30枚・表示12枚、エラーメッセージ改善
- **テスト** — schedule-v1 / survey-v1 / estimate-v1 / multi-pwa-app-hub PASS、`npm run build` 成功

## 完了（前回）

- 見積・請求PDF TOMS帳票寄せ、番号ルール、4種PDF、Unauthorized対策

## 既存稼働中

- App Hub (`/app`)、現調PWA v1 (`/survey-v1`)、見積PWA v1 (`/estimate-v1`)、日程調整 (`/schedule-v1`)

## 未完了・ブロック

| 項目 | 状態 |
|------|------|
| VPS 本番反映 | SSH `tisly.jp:22` が Cursor 環境からタイムアウト → **人間が SSH または ConoHa VNC で pull** |
| Google Calendar 本接続 | OAuth・APIキー未取得（モック稼働中） |
| 見積・請求検索 PWA | 検索インデックス保存済み、UIは未実装 |

## 本番確認用URL

- https://tisly.jp/app
- https://tisly.jp/schedule-v1
- https://tisly.jp/survey-v1
- https://tisly.jp/estimate-v1

## ログイン（デモ）

- 会社コード: `TOMS001`
- ユーザー: `toms001.surveyor`
- パスワード: `.env` の `CUSTOMER_DEMO_PASSWORD`

## 人間作業

→ [HUMAN_TODO.md](./HUMAN_TODO.md)

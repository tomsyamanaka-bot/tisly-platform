# 現在の状態（2026-06-08）

## 完了

- **現調PWA v1** (`/survey-v1`) — 実務向けUI
  - 大きい「新しい現調を作る」ボタン
  - お客様名・電話・住所・現調メモ
  - 写真カード・撮影/メモゾーン
  - 部材選択カード（8種類）
  - 「見積へ送る」（下部固定表示）
  - やさしいエラー文言（原因 + 次の操作）
- **見積PWA v1** (`/estimate-v1`) — 実務向けUI
  - 見積待ち一覧
  - 項目名・数量・単価のスマホ編集
  - 小計・消費税・税込合計
  - PDFプレビュー / TOMS形式 / 見積確定
- **App Hub** (`/app`) — 「今日使うアプリ」
  - 現調する / 見積を作る / 作業報告・顧客・在庫（準備中）
  - 共通ナビ（戻る/進む/🏠 + 下部タブ・準備中バッジ）
- **デザイン** — `tisly-friendly-ui.css` + `tisly-practical-nav.css`
- **テスト** — survey-v1 / estimate-v1 / multi-pwa-app-hub PASS（ローカル）
- **Git** — `master` に push 済み（本番 pull 待ち）

## 未完了・ブロック

| 項目 | 状態 |
|------|------|
| VPS 本番反映 | SSH `tisly.jp:22` が Cursor 環境からタイムアウト → **人間が SSH または ConoHa VNC で pull** |
| 本番URL実機確認 | デプロイ後に iPhone Safari でチェックリスト実施 |
| 写真の永続ストレージ | 小画像は保存可。大容量・オフライン同期は今後 |

## 本番確認用URL

- https://tisly.jp/app
- https://tisly.jp/survey-v1
- https://tisly.jp/estimate-v1

## ログイン（デモ）

- 会社コード: `TOMS001`
- ユーザー: `toms001.surveyor`
- パスワード: `.env` の `CUSTOMER_DEMO_PASSWORD`（本番は変更推奨）

## 人間作業

→ [HUMAN_TODO.md](./HUMAN_TODO.md)（本番反映手順・VNC代替・スマホチェックリスト）

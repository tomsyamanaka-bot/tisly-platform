# 現在の状態（2026-06-08）

## 完了

- **現調PWA v1** (`/survey-v1`) — 実務向けUI
  - 大きい「新しい現調を作る」ボタン
  - お客様名・電話・住所・現調メモ
  - 写真追加ゾーン（撮影/メモ）
  - 部材選択をカード型（8種類）
  - 「見積へ送る」
- **見積PWA v1** (`/estimate-v1`) — 実務向けUI
  - 見積待ち一覧（現調からの案件カード）
  - 項目名・数量・単価のスマホ編集
  - 小計・消費税・税込合計の自動計算
  - PDFプレビュー / TOMS形式で確認 / 見積を確定
- **App Hub** (`/app`) — 「今日使うアプリ」入口
  - 現調する / 見積を作る / 作業報告・顧客・在庫（準備中）
  - 共通ナビ（戻る/進む/アプリ一覧 + 下部タブ）
- **デザイン** — 白〜薄グレー〜淡い青、カード型、大きいボタン、素人向け文言
- **テスト** — survey-v1 / estimate-v1 / multi-pwa-app-hub PASS
- **Git** — `feat(practical-pwa): improve field survey and estimate mobile workflow`

## 未完了・ブロック

| 項目 | 状態 |
|------|------|
| VPS 本番反映 | SSH `tisly.jp:22` がタイムアウト（この環境から未接続） |
| 本番URL実機確認 | `https://tisly.jp` への fetch もタイムアウト |
| 写真の永続ストレージ | 小さい画像は保存可。大容量・オフライン同期は今後 |

## 本番確認用URL

- https://tisly.jp/app
- https://tisly.jp/survey-v1
- https://tisly.jp/estimate-v1

## ログイン（デモ）

- 会社コード: `TOMS001`
- ユーザー: `toms001.surveyor`
- パスワード: `demo-remote-2026`（本番では変更推奨）

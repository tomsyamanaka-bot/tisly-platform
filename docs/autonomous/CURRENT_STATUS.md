# 現在の状態（2026-06-08）

## 完了（今回）

- **PDF Unauthorized 解消** — Bearer JWT + `access_token` クエリ。iframe は Blob URL、別タブはトークン付き URL
- **PDFプレビュー** — 確定前でも TOMS 形式 HTML プレビュー可能（`renderEstimateHtml`）
- **見積項目複数対応** — 追加・削除・並び替え・リアルタイム合計・備考
- **顧客情報強化** — 依頼主 / 依頼主住所 / 現場名 / 工事場所 / 担当者 / 電話 / メール を分離入力
- **写真ライブラリ** — カメラ撮影・iPhone 写真ライブラリ複数選択（`multiple`、ドラッグ不要）
- **写真大量対応** — クライアント圧縮、Lazy Load、36枚ずつ「さらに表示」、スクロール最適化
- **見積レイアウト** — TOMS 御見積書 HTML（依頼主・現場ブロック、明細表、小計・税・合計、備考）
- **テスト** — survey-v1 / estimate-v1 / multi-pwa-app-hub すべて PASS
- **Git** — commit & push 済み（本番 pull 待ち）

## 既存（前回まで）

- 現調PWA v1 (`/survey-v1`)・見積PWA v1 (`/estimate-v1`)・App Hub (`/app`)
- 部材カード 8 種・見積連携・共通ナビ

## 未完了・ブロック

| 項目 | 状態 |
|------|------|
| VPS 本番反映 | SSH `tisly.jp:22` が Cursor 環境からタイムアウト → **人間が SSH または ConoHa VNC で pull** |
| 本番URL実機確認 | デプロイ後に iPhone Safari でチェックリスト実施 |
| 本番 PDF（Puppeteer） | 現状 HTML プレビュー + 簡易 PDF バイナリ。TOMS 正式 PDF は次フェーズ |

## 本番確認用URL

- https://tisly.jp/app
- https://tisly.jp/survey-v1
- https://tisly.jp/estimate-v1

## ログイン（デモ）

- 会社コード: `TOMS001`
- ユーザー: `toms001.surveyor`
- パスワード: `.env` の `CUSTOMER_DEMO_PASSWORD`

## 人間作業

→ [HUMAN_TODO.md](./HUMAN_TODO.md)

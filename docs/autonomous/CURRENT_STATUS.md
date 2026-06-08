# 現在の状態（2026-06-08）

## 完了（今回）

- **見積・請求PDF TOMS帳票寄せ** — タイトル「お見積書」「御請求書」、宛名御中、件名欄、右上に発行日・番号・登録番号・会社情報を固定表示
- **金額表示** — 上部に税込合計を大きく中央表示（amount-banner）、明細は No / 適用 / 数量 / 単価 / 金額
- **明細複数行** — 適用欄の改行保持、空行のみの明細はPDF非表示、20件超でもレイアウト維持
- **写真あり・なし完全分離** — 見積/請求それぞれ `includePhotos=0|1`（デフォルト写真なし）。PWAに4ボタン＋TOMS形式確認
- **番号ルール** — 見積・請求とも `YYMMDD-001` 形式（当日連番3桁）
- **Unauthorized対策** — Bearer + `access_token` クエリ、401時は「ログインが切れました。もう一度ログインしてください」
- **テスト** — toms-estimate-format / estimate-v1 / business-pdf-template PASS、`npm run build` 成功

## 既存（前回まで）

- 現調PWA v1 (`/survey-v1`)・見積PWA v1 (`/estimate-v1`)・App Hub (`/app`)
- 部材カード 8 種・見積連携・共通ナビ
- PDFプレビューは HTML ライブ生成（写真モード切替対応）

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

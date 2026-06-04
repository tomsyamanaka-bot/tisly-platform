# Sales Presentation Mode（Phase 861–900）

## URL

**`/sales`** — 営業専用プレゼン画面（お客様向けの平易な文言・大きめボタン）

**`/sales/floor-preview`** — 建物の見取り図（外周・1階・2階）

詳細: [sales_demo_operation.md](./sales_demo_operation.md)

## カード構成

| カード | 内容 |
|--------|------|
| TiSLY 概要 | プラットフォーム説明 |
| 導入効果 | 顧客ポータルリンク |
| 削減効果 | KPI ダッシュボード |
| 通知デモ | 5種ワンクリック |
| 現調デモ | 現調アプリ |
| 保守デモ | PRO Remote |
| AI 見積デモ | mock フロー実行 |
| デモ顧客パック | 5顧客の稼働状況 |

## デモ初期化

画面上部 **「デモを初期化」** → `POST /api/demo-kit/reset`

## ファイル

- `server/public/sales.html`
- `server/public/js/sales-demo.js`

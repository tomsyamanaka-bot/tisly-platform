# PRO Remote 図面プレビュー（営業用）

## URL

- **`/sales/floor-preview?customer=TOMS001`**
- クエリ `scrollTo=perimeter|1f|2f` で該当階へ自動スクロール

## 表示内容

| 階 | tier | 設備ピン例 |
|----|------|------------|
| 外周 | perimeter | ビーム、カメラ、正門 |
| 1階 | 1f | 通信機、照明制御、人感 |
| 2階 | 2f | 窓センサー、廊下カメラ |

屋上は含めません。

## 状態の色

| 表示 | 意味 |
|------|------|
| 緑 | 正常（ONLINE） |
| 黄 | 注意（WARNING） |
| 赤 | つながらない（OFFLINE） |

## API

`GET /api/demo-kit/floor-preview/:customerCode`

- `layers[]` — 図面 URL（`/assets/demo-floor/*.svg`）とピン一覧
- `alert.tier` — 異常がある階（侵入・ESP異常後に更新）

## 営業デモとの連携

`/sales` の「侵入を発生させる」実行後、  
`/sales/floor-preview?customer=...&scrollTo=perimeter` へ遷移します。

認証なしで説明用に閲覧できます（デモ顧客コードのみ）。

# ROI Simulator v2（Phase 908）

## 入力

| 項目 | フィールド |
|------|------------|
| 件数（拠点） | `siteCount` |
| 年間出動回数 | `dispatchCountPerYear` |
| 人件費/回 | `laborCostPerDispatch` |
| 車両費/回 | `vehicleCostPerDispatch` |
| 削減率（任意） | `reductionRate`（既定 0.65） |

## 出力

- `annualReductionJpy` — 年間削減額
- `monthlyReductionJpy`
- `chart` — 棒グラフ用 3 点（現状 / 削減 / 導入後）

## API

`POST /api/demo-kit/roi-simulator`

## 画面

`/sales` — Canvas 棒グラフ + 金額表示

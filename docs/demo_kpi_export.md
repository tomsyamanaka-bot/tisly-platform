# デモ KPI CSV 出力

## ダウンロード

`/sales` の **「KPI を CSV で保存」** または

```
GET /api/demo-kit/kpi/csv
```

ファイル名: `demo-kpi.csv`

## 含まれる項目

| metric | 日本語ラベル |
|--------|----------------|
| revenue | 売上 |
| gross_profit | 粗利 |
| project_count | 案件数 |
| unpaid | 未入金 |
| maintenance_cases | 保守件数 |
| anomaly_count | 異常件数 |
| dispatch_reduction_estimate | 出動削減見込み |

## 出動削減見込みの計算（デモ）

```
異常件数 × 0.65 × 28,000円（1件あたりの出動コスト想定）
```

`estimateDispatchReductionJpy()` — `server/src/demo-kit/demo-kpi-export.ts`

本番 KPI は引き続き `GET /api/toms/kpi/csv` を使用してください。

# Business Payment & Accounting CSV

## テーブル `business_payments`

入金額・日付・方法・メモを案件・請求に紐付け。

## API

- `POST /api/business/projects/:projectId/payment`
- `GET /api/business/payments`
- `GET /api/business/accounting/export-csv`

会計 CSV 列: 顧客名、案件名、請求日、入金日、税抜、消費税、税込、入金額、状態。

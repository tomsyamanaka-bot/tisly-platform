# Business Pricing CSV

## 列

`customer_code, contractor_code, work_category, item_name, unit, unit_price, tax_type, active`

## API

- `POST /api/business/pricing/import-csv` — body: `{ "csv": "..." }`
- `GET /api/business/pricing/export-csv?customer_code=&contractor_code=`

UI: `/business/pricing` で取込・出力・フィルタ。

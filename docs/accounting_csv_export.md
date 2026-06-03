# 会計CSVエクスポート

`GET /api/business/accounting/export-csv?format=`

| format | 用途 |
|--------|------|
| `standard` | 日付・取引先・勘定科目・税区分・金額・消費税・摘要・案件ID |
| `freee` | freee 向け placeholder 列 |
| `yayoi` | 弥生向け placeholder 列 |

入金レコードがある案件のみ出力（標準形式は Phase561 の案件ベース CSV も `format` 省略で利用可）。

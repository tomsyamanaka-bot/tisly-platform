# 顧客レポート PDF 基盤（Phase 261–280）

## モジュール

| ファイル | 役割 |
|----------|------|
| `server/src/reports/report-builder.ts` | HTML 組立・メタデータ |
| `server/src/reports/customer-monthly-report.ts` | 月次レポート |
| `server/src/reports/customer-weekly-report.ts` | 週次レポート |
| `server/src/reports/report-exporter.ts` | export 記録・QNAP mock |

## API

| メソッド | パス | プラン |
|----------|------|--------|
| GET | `/api/customer/:code/reports/monthly` | sales_report |
| GET | `/api/customer/:code/reports/weekly` | sales_report |
| POST | `/api/customer/:code/reports/export` | sales_report |

`?format=html` で HTML 直返し。

## export_id と監査

`report_exports` テーブル + `audit_logs` action `report.export`

| フィールド | 説明 |
|------------|------|
| export_id | 一意 ID |
| customer_id | 顧客 |
| site_id | 主現場（任意） |
| generated_by | 実行者 |
| generated_at | 生成日時 |
| format | html / pdf / json |
| status | generated / archived |

## QNAP 保存先

`/TiSLY/{customer_code}/{site_id}/reports/YYYY/MM/{export_id}.html`

`QNAP_MODE=mock` 時は `qnap_archives` にパス記録のみ。

## PDF（TODO）

Puppeteer で HTML → PDF。`report-exporter.ts` に TODO コメントあり。

## 従来 API

`GET /api/customer/:code/sales-report` は引き続き利用可能（営業向け JSON/HTML）。

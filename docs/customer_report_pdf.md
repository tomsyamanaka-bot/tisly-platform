# 顧客レポート PDF 設計（Phase 241–260）

## 現状

- `GET /api/customer/:code/sales-report` — JSON
- `GET /api/customer/:code/sales-report.html` — 簡易 HTML（本格 PDF は TODO）

## 月報 / 週報に含める項目

- 顧客名・`customer_code`
- 現場名一覧
- 期間（from / to）
- 月間イベント数
- 警報件数
- 復旧件数
- 稼働率（%）
- AI コメント
- 改善提案
- `export_id`（監査用）
- 監査ログ参照 ID

## Recovery 実績

`recovery_incidents` をテナントスコープで集計（PRO 以上）。

## 本格 PDF（TODO）

- Puppeteer / wkhtmltopdf で HTML → PDF
- QNAP アーカイブ連携
- `POST /api/customer/:code/reports/export` + audit log

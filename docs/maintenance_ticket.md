# Maintenance Ticket（保守案件）

## 顧客導入画面

`/customer/:customerCode/deploy`

## API

- `GET /api/deployment-kit/maintenance/:customerCode` — 概要・履歴
- `POST /api/deployment-kit/maintenance/request` — 保守依頼
- `POST /api/deployment-kit/maintenance/:caseId/complete` — 保守完了

`maintenance_cases` テーブルに `MNT-XXXXXXXX` 形式で登録されます。

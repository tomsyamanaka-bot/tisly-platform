# Business Integration Logs

## テーブル `business_integration_logs`

| 列 | 説明 |
|----|------|
| type | calendar, gmail, qnap, pdf, status_flow |
| provider | mock, google, webdav, puppeteer, … |
| status | success, error, skipped |

## API

`GET /api/business/integration-logs?projectId=`

カレンダー下書き・メール下書き・QNAP・PDF・ステータス遷移・オフライン同期で自動記録。

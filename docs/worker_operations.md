# バックグラウンドワーカー（Phase 301–320）

## 起動

`server/src/index.ts` で `startWorkers()` を呼び出し。

| 変数 | 既定 |
|------|------|
| `WORKERS_ENABLED` | true（`false` で停止） |
| `WORKER_INTERVAL_MS` | 15000 |

## 処理対象

1. `notification_queue` — email 再送
2. `webhook_delivery_logs` — 最大 5 回・指数バックオフ
3. `report_email_queue` — レポートメール

## 状態 API

Infrastructure タブ（`/operations`）および `getWorkerStatus()`:

- キュー件数
- Stripe / SMTP / Puppeteer 設定

## 監査

各処理で `logAudit`（`worker.notification_sent`, `report.email_sent` 等）

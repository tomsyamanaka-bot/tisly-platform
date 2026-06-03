# Gmail / QNAP 復旧キュー（Phase 701–740）

## テーブル

`business_integration_retry_queue` — channel: gmail | qnap | pdf

## ステータス

`pending` → `retrying` → `success` | `failed` | `cancelled`

## sendMode 表示

- `dryRun` — ドライラン
- `mockOnly` — モックのみ（デフォルト）
- `realSend` — 本番送信（デモでは2回目以降で成功扱い）

## API

| Method | Path |
|--------|------|
| GET | `/api/toms/projects/:id/retry-queue` |
| POST | `.../retry-queue/:itemId/retry` |
| POST | `.../retry-queue/:itemId/cancel` |
| GET | `.../retry-queue/:itemId/log` |
| GET | `/api/business/retry-queue` |

## タイムライン

`failed` → `retrying` → `success` を Project Timeline に自動記録。

連携ログ `status: error` 時に自動 enqueue（`business-integration-log.ts`）。

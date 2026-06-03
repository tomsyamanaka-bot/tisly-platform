# PRO Remote 統合運用（Phase 281–300）

## Operations コンソール

- URL: `/operations`
- Customer Scope: `TOMS001` / `HOTEL001` / `PLANT001` / `ALL`
- サマリー: `GET /api/ops/summary?customerCode=TOMS001`

表示項目: open incidents、critical、recovery pending、TV offline、QNAP warning。

## 顧客スコープ付き API

| API | クエリ |
|-----|--------|
| `/api/incidents` | `customerCode` |
| `/api/events` | `customerCode` |
| `/api/devices` | `customerCode` |
| `/api/tv/devices` | `customerCode` |
| `/api/ops/soc` / `noc` | `customerCode` |

デモ API（`/api/demo/*`）は全テナント集約のまま。実データ API は `customerCode` でフィルタ。

## Incidents

正テーブル: `incidents`。旧 `recovery_incidents` 参照は `incident-store.listRecoveryHistory` に置換。

アクション: `POST /api/incidents/:id/ack|close|escalate`（スコープ必須）。

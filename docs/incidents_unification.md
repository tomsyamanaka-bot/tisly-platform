# Incidents 統一

## 背景

`recovery_incidents` テーブルは未定義のままポータル/レポートから参照されていた。Phase 281+ では **`incidents` を正**とする。

## モジュール

- `server/src/incidents/incident-status.ts` — 状態遷移
- `server/src/incidents/incident-converter.ts` — レガシー view 変換
- `server/src/incidents/incident-store.ts` — CRUD・スコープ・デモ投入

## API

`GET /api/incidents?customerCode=TOMS001`  
`POST /api/incidents/:id/ack|close|escalate`

`customer_id` / `tenant_id` 不一致の incident は 404（スコープ拒否）。

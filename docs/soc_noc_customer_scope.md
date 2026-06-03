# SOC/NOC 顧客スコープ（Phase 261–280）

## Operations UI

`/operations` ヘッダに **Customer Scope** セレクタを追加。

| 値 | 表示 |
|----|------|
| ALL | 全顧客 |
| TOMS001 | トムス顧客 |
| HOTEL001 | ホテル顧客 |
| PLANT001 | プラント顧客 |

選択値は `localStorage.tisly.selectedCustomerScope` に保存。

## インシデント API

`GET /api/incidents?customerCode=TOMS001` — 管理者 JWT 必須。

| 操作 | パス |
|------|------|
| ACK | `POST /api/incidents/:id/ack` |
| Close | `POST /api/incidents/:id/close` |
| Escalate | `POST /api/incidents/:id/escalate` |

## 状態・重要度

**status:** `open` | `acknowledged` | `escalated` | `resolved` | `closed`

**severity:** `info` | `warning` | `alarm` | `critical`

## 今後の拡張

デモ API（map/alarms）は顧客スコープ未連携。Phase 281+ で `tenant_id` / `customer_id` クエリを各 ops エンドポイントに統一。

# Demo Movie Mode（Phase 909）

展示会向けにシーンを自動再生します。

## シーケンス

1. **notify** — 保守通知
2. **intrusion** — 侵入
3. **recovery** — ESP 異常 → Shelly 再起動デモ
4. **maintenance** — 保守リマインド

## API

- `POST /api/demo-kit/demo-movie/start` — `{ customerCode, intervalMs }`（既定 8000ms）
- `POST /api/demo-kit/demo-movie/stop`
- `GET /api/demo-kit/demo-movie`

## 営業 UI

`/sales` — 「再生開始」「停止」

# 営業 UI WebSocket 本番寄せ（Phase 981–1000）

## 動作

1. `/sales` 起動時に `ws://host/ws` へ接続
2. `{ type: "subscribe", channel: "sales" }` を送信
3. `sales/demo` イベントでダッシュボード更新（**polling 停止**）
4. WS 切断時は 20 秒 polling + 5 秒後に再接続

## バッジ

| ID | 意味 |
|----|------|
| `#live-status-badge` | LIVE / MOCK / OFFLINE（deviceMode） |
| `#shelly-env-badge` | REAL / MOCK（SHELLY_MODE） |
| `#conn-mode-badge` | WS / Poll |

## 異常ハイライト

侵入・ESP/Shelly 異常・通知イベントで **10 秒** `.hero` 枠ハイライト。

## API

- `GET /api/demo-kit/status` — `liveBadge`, `shellyEnvBadge`
- `POST /api/demo-kit/tv/push` — TV ミラー連携

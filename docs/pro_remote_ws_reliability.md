# PRO Remote 双方向 WS 信頼性（Phase 781–820）

## 安定化

- `ack` / `close` / `escalate` / `floor_nav` / `pin_select` → `pro_mirror` broadcast
- `subscribe` 時に **最新 PRO Remote 状態を replay**（`replay: true`）
- 操作は `pro_operations` テーブル + メモリ snapshot に保存

## UI

- `setWsDisconnectedBadge(true)` — 切断時に共通バッジ「WS offline」
- 案件司令塔 `dash-ws-status` バッジ併用

## 実装

- `server/src/ws/hub.ts`
- `server/src/toms/pro-remote-state.ts`
- `server/public/js/project-dashboard.js`
- `server/public/js/connection-badges.js`

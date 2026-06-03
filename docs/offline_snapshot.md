# App Hub Offline Snapshot（Phase 741–780）

## 概要

司令塔（App Hub）の今日の現調・工事・未請求・未入金・異常・保守期限を IndexedDB に保存し、オフラインでも直近状態を表示します。

## 保存項目

`buildHubOfflineSnapshot` — operations + summary

## API

- `GET /api/toms/hub/snapshot`
- `POST /api/toms/hub/snapshot/sync`

## クライアント

- `public/js/hub-offline-snapshot.js`
- DB: `tisly_hub_snapshot_v741`
- 手動「同期」: `#btn-hub-sync` / `#btn-hub-sync-inline`
- 上部バー: `#tisly-sync-status`

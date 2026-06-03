# オフライン同期 — 競合解決（Phase 381–400）

## API

```
POST /api/customer/:code/install/sync
```

## 結果ステータス

| status | 意味 |
|--------|------|
| `applied` | サーバーに反映 |
| `rejected` | 拒否（例: 既 claim 済み） |
| `skipped` | 重複写真等 |
| `conflict` | サーバーが `clientAt` より新しい — 手動マージ |
| `merged` | UI で手動マーク（placeholder） |

## クライアント

- Service Worker: `docs/service_worker_offline_sync.md`
- Offline Status バー + 競合パネル（`installer-mode.html`）
- `localStorage` `tisly_installer_conflicts_{CODE}`

## 写真

オフライン `photo_upload` は skipped。本体は `POST .../install/photos/upload` をオンラインで使用。

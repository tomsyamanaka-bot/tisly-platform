# オフライン同期 — 競合解決（Phase 361–380）

## API

```
POST /api/customer/:code/install/sync
{ "entries": [ { "id", "action", "clientAt", "body" }, ... ] }
```

実装: `server/src/installer/offline-sync.ts`

## ルール

| 状況 | 結果 |
|------|------|
| サーバー `updated_at` が `clientAt` より新しい（map / qr 警告対象） | `warning` — 手動確認 |
| 同一デバイスが既に `claimed` / `completed` | `rejected` |
| 同一チェックリスト項目の再完了 | `applied`（idempotent） |
| 同一写真ファイル名が既存 | `skipped` |
| 写真本体（オフライン placeholder） | `skipped` — ライブ `install/photos/upload` を使用 |

## クライアント

- `localStorage` キー: `tisly_installer_queue_{CUSTOMER_CODE}`
- IndexedDB: `tisly_installer_offline_v1`（メタ placeholder）
- PWA ボタン: **オフラインキュー同期**

## 関連

- `docs/offline_installer_pwa.md`

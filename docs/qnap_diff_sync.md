# QNAP 差分同期（Phase 781–820）

## 動作

1. ローカルファイルの `checksum` / `size` / `modifiedAt` を計算
2. `qnap_upload_manifest` と比較 — 同一なら **skip**
3. 差分のみ WebDAV PUT（mock 時は `uploads/qnap-mock/` へコピー）
4. 失敗時は `business_integration_retry_queue` へ enqueue

## API

`POST /api/business/qnap/sync-diff`

```json
{
  "projectId": "BIZ-…",
  "files": [{ "localPath": "/path/file.pdf", "remotePath": "02_見積書/file.pdf" }]
}
```

## 実装

- `server/src/business/qnap-diff-sync.ts`

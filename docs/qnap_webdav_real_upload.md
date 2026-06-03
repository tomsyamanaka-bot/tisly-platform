# QNAP WebDAV 実アップロード

## 環境変数

```
QNAP_UPLOAD_MODE=mock|real
QNAP_WEBDAV_URL=https://nas.example/dav/TOMS
QNAP_USERNAME=
QNAP_PASSWORD=
QNAP_BASE_PATH=/TOMS/business
```

`QNAP_UPLOAD_MODE=real` かつ URL/username 設定時に WebDAV クライアントを使用。

## 操作

- `POST /api/business/qnap/test-connection` — OPTIONS による到達確認
- `POST /api/business/projects/:id/qnap/upload` — mock（従来）
- `POST /api/business/projects/:id/qnap/upload-real` — MKCOL + PUT（real 時ガード適用）

失敗は `business_integration_logs`（type: `qnap`）に記録。

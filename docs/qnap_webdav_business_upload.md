# QNAP WebDAV Business Upload

## 設定

- `QNAP_UPLOAD_MODE=mock|real`
- `QNAP_WEBDAV_URL`, `QNAP_USERNAME`, `QNAP_PASSWORD`, `QNAP_BASE_PATH`

## API

- `POST /api/business/projects/:projectId/qnap/upload`
- `GET /api/business/projects/:projectId/qnap/status`

mock 時は `server/uploads/qnap-mock/{projectId}/` にミラー保存。

real 時は `QnapWebDavUploader` インターフェースのみ（実装 TODO）。

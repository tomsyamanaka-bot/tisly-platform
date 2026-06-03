# QNAP WebDAV Real Upload（Phase 741–780）

## 概要

`QNAP_UPLOAD_MODE=real` かつ WebDAV 資格情報設定時、PUT/MKCOL で PDF を NAS へ保存します。

## 対象 PDF

- 仕様書（`07_仕様書`）
- 見積（`02_見積書`）
- 完了報告（`04_完了報告書`）

## 失敗時

`business_integration_retry_queue` に `channel: qnap`, `sendMode: realSend` で enqueue。

## 環境変数

```
QNAP_UPLOAD_MODE=real
QNAP_WEBDAV_URL=https://nas.example/webdav
QNAP_USERNAME=
QNAP_PASSWORD=
QNAP_BASE_PATH=/TOMS/business
```

## 関数

- `uploadBusinessToQnapReal`
- `uploadQnapAutoPdfs` — 個別 PDF 自動 PUT

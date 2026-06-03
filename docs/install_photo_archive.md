# 施工写真アーカイブ設計

## 現状（local）

- 保存: `uploads/install_photos/{customerCode}/`
- API: `POST/GET/DELETE /api/customer/:code/install/photos`
- レガシー: `uploads/install-photos/` も読取互換

## QNAP

- `server/src/qnap/install-photo-archive.ts`
- `QNAP_MODE=real` + SMB 認証時にパス生成（アップロードは TODO）

## S3 placeholder

- `server/src/storage/s3-client.ts`
- `.env`: `STORAGE_PROVIDER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`

## 移行 TODO

1. アップロード時に dual-write（local + S3）
2. 署名付き URL で PWA プレビュー
3. 完了レポートに CDN URL を埋め込み

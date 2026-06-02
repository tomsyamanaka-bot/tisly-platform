# QNAP SMB アーカイブ（Phase 121–140）

## 環境変数

```env
QNAP_HOST=192.168.x.x
QNAP_SHARE=TiSLY
QNAP_USERNAME=archive_user
QNAP_PASSWORD=***
QNAP_BASE_PATH=/TiSLY
```

## 保存パス

| 種別 | パス |
|------|------|
| イベント | `/TiSLY/{tenant_id}/{site_id}/events/YYYY/MM/DD/` |
| レポート | `/TiSLY/{tenant_id}/{site_id}/reports/YYYY/MM/` |
| カメラ | `/TiSLY/{tenant_id}/{site_id}/cameras/YYYY/MM/DD/` |

実装: `server/src/qnap/archive-path-builder.ts`

## 現状

- **ローカル mock**: `data/qnap-archive/`（SMB 未設定時）
- **SMB**: `smb-client.ts` プレースホルダー — NAS 到着後に write 実装
- **export**: `export-manager.ts` がローカル + SMB 予定パスを返す

## API

- `GET /api/qnap/status`
- `POST /api/qnap/archive/event`

## VPS 手順

1. QNAP で共有フォルダ `TiSLY` 作成
2. 専用ユーザーを read/write のみ付与
3. `.env` に QNAP_* を設定
4. `curl http://localhost:3080/api/qnap/status` で `smbConfigured: true` を確認

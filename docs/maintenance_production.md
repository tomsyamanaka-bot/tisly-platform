# Maintenance Production System (Phase 481–500)

## API

| Method | Path | 説明 |
|--------|------|------|
| CRUD | `/api/maintenance/cases` | 保守案件（顧客・現場・機器紐付け） |
| GET | `/api/maintenance/recovery-history/:customerCode` | Recovery 履歴（成功/失敗・実施者・日時） |
| GET | `/api/maintenance/shelly/:customerCode` | Shelly 一覧・状態 |
| POST | `/api/maintenance/shelly/:customerCode/:deviceId/reboot` | Shelly 再起動 |

## 認証

`maintenance` 以上（`toms001.maintenance`）。

## PWA

`/maintenance` — Shelly 再起動 UI、案件作成、オフライン案件キュー

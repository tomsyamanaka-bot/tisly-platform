# バックアップ戦略（Phase 161–180）

## 対象

| 種別 | 内容 | 保存先 |
|------|------|--------|
| sqlite | `tisly_notifications.db` コピー | `data/backups/YYYY-MM-DD/` |
| events | 直近 5000 件 JSON | 同上 |
| settings | `platform_settings` 全件 | 同上 |
| reports | メタデータ（本体は API 生成） | 同上 |

## 手動実行

```http
POST /api/security/backup/run
Authorization: Bearer <token>
```

## スケジュール（オプション）

`.env`:

```
BACKUP_SCHEDULER_ENABLED=true
BACKUP_INTERVAL_HOURS=24
```

## QNAP との関係

- ローカル `data/backups/` は VPS 内の短期復旧用
- 長期保管は QNAP SMB + retention（30/90/365 日 purge）

## 復旧手順

1. サービス停止
2. `data/backups/<date>/tisly-*.db` を `TISLY_DB_PATH` へコピー
3. `npm run build && npm start`
4. `/api/health` で `database: ok` を確認

## TODO

- [ ] Redis 化したレート制限と同様、バックアップキューを外部ストアへ
- [ ] PostgreSQL 移行後は `pg_dump` ベースに切替（`docs/postgresql_migration.md`）

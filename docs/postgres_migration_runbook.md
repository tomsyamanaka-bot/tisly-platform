# PostgreSQL 移行 Runbook（Phase 301–320）

## 1. SQLite バックアップ

```bash
cd server
npm run db:backup
cp data/tisly_notifications.db data/tisly_notifications.db.bak.$(date +%Y%m%d)
```

## 2. PostgreSQL スキーマ適用

```bash
psql -f server/src/db/postgres/schema.postgres.sql
psql -f server/src/db/postgres/indexes.postgres.sql
# RLS は docs/postgres_rls_tenant_isolation.md 参照（本番前）
```

## 3. データ移行

```bash
export DB_PROVIDER=postgres
export DATABASE_URL=postgresql://tisly:pass@127.0.0.1:5432/tisly
npm run migrate:sqlite-to-postgres
```

補助モジュール:

- `server/src/db/migration/migrate-customers.ts`
- `migrate-events.ts`
- `migrate-incidents.ts`
- `migration-verify-report.ts`

## 4. 検証

```bash
tsx -e "import { getDatabase } from './src/db/database.js'; import { buildMigrationVerifyReport } from './src/db/migration/migration-verify-report.js'; console.log(buildMigrationVerifyReport(getDatabase()));"
```

期待: TOMS001 / HOTEL001 / PLANT001 が存在。

## 5. ロールバック

1. `DB_PROVIDER=sqlite` に戻す
2. バックアップ DB を `TISLY_DB_PATH` に復元
3. アプリ再起動

## 注意

- 移行中は RLS を無効のままバッチ接続（service role）
- 本番切替後に `SET LOCAL app.current_customer_id` を有効化

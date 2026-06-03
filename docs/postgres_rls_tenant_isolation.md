# PostgreSQL Row Level Security — テナント分離設計

**実装 SQL:** `server/src/db/postgres/rls.sql`（Phase 281–300）。**DB への適用は TODO。** SQLite デモは `customer-context.ts` のアプリ層ガードを継続。

## 方針

- 全顧客データテーブルに `customer_id` および/または `tenant_id` を必須化
- セッション変数 `app.current_customer_id` を RLS で参照
- `super_admin` は `BYPASSRLS` ロールまたは policy で READ/WRITE 全件

## セッション変数（Phase 301–320）

トランザクション開始直後に設定:

```sql
BEGIN;
SET LOCAL app.current_customer_id = 'cust_toms001';
SET LOCAL app.current_tenant_id = 'tenant_toms001';
-- クエリ ...
COMMIT;
```

| ロール | 用途 |
|--------|------|
| `tisly_app` | 顧客 JWT 接続 — RLS 適用 |
| `tisly_service` | ワーカー・移行 — `BYPASSRLS` または service policy |
| `tisly_platform_admin` | super_admin — bypass policy |

## 例: customers スコープ events

```sql
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_tenant_isolation ON events
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)
    OR customer_id = current_setting('app.current_customer_id', true)
  );
```

## 例: customer_users

```sql
CREATE POLICY customer_users_self_tenant ON customer_users
  FOR ALL
  USING (customer_id = current_setting('app.current_customer_id', true));
```

## マイグレーション注意

1. 既存行に `customer_id` をバックフィルしてから RLS 有効化
2. インデックス `(customer_id)`, `(tenant_id)` を先に作成
3. アプリ接続は顧客 JWT ごとに `SET LOCAL app.current_customer_id = ...` を transaction 開始時に実行
4. バッチ・移行ジョブは `tisly_service` で BYPASSRLS — **移行完了まで RLS を有効化しない**
5. `migrate-customers.ts` / `migrate-events.ts` 実行中は単一 service 接続のみ

## テスト SQL

```sql
-- 顧客 A のコンテキスト
SET LOCAL app.current_customer_id = (SELECT customer_id FROM customers WHERE customer_code = 'TOMS001');
SELECT COUNT(*) FROM events;  -- TOMS のみ

-- 他顧客は 0 件になること
SET LOCAL app.current_customer_id = (SELECT customer_id FROM customers WHERE customer_code = 'PLANT001');
SELECT COUNT(*) FROM events WHERE tenant_id IS NOT NULL;
```

## 監査

- `audit_logs` は RLS 対象外または platform 専用 policy
- レポート `report_exports` は customer_id policy

## super_admin bypass

```sql
CREATE POLICY platform_admin_bypass ON events
  FOR ALL
  TO tisly_platform_admin
  USING (true)
  WITH CHECK (true);
```

## 関連

- `server/src/auth/tenant-guard.ts`（現行アプリ層）
- `docs/er_phase221.md`

# PostgreSQL Schema — Phase 181-200

TiSLY Platform の PostgreSQL 向けスキーマ定義です。  
現行デフォルトは **SQLite**（`DB_PROVIDER=sqlite`）。本番 VPS では `DB_PROVIDER=postgres` へ切替予定（Phase 201+ で `pg` ドライバ接続）。

## ファイル

| ファイル | 内容 |
|----------|------|
| `schema.postgres.sql` | テーブル定義 |
| `indexes.postgres.sql` | インデックス（冪等 ingest 含む） |

## 適用（将来）

```bash
psql "$DATABASE_URL" -f server/src/db/postgres/schema.postgres.sql
psql "$DATABASE_URL" -f server/src/db/postgres/indexes.postgres.sql
```

## SQLite との主な差分

| 項目 | SQLite | PostgreSQL |
|------|--------|--------------|
| 日時型 | `TEXT` + `datetime('now')` | `TIMESTAMPTZ` + `NOW()` |
| JSON | `TEXT` (JSON 文字列) | `JSONB` |
| 真偽値 | `INTEGER` 0/1 | `BOOLEAN` |
| 外部キー | 実行時 PRAGMA | 宣言時 `REFERENCES` |
| WAL | `journal_mode=WAL` | 標準 MVCC |
| 接続 | 単一ファイル `better-sqlite3` | `pg` Pool（TODO Phase 201+） |
| ingest 冪等 | 部分 UNIQUE INDEX | 同様 `WHERE event_id IS NOT NULL` |

## 対象テーブル（本 Phase）

- `events` — イベント ingest（冪等キー: tenant + site + device + event_id）
- `devices` — 登録デバイス
- `tv_devices` — Google TV ペアリング
- `audit_logs` — 監査
- `admin_sessions` — JWT セッション失効
- `notification_logs` / `notification_queue` — 通知
- `qnap_archives` — QNAP アーカイブメタ
- `recovery_actions` — Recovery 実行記録
- `device_credentials` — デバイス secret（hash + encrypted）
- `totp_secrets` — 2FA 準備

## TODO（Phase 201+）

- [ ] `pg` Pool 接続と `postgres-provider.ts` 実装
- [ ] SQLite → PostgreSQL データ移行スクリプト
- [ ] 全テーブル（tenants, sites, incidents 等）の PostgreSQL 版追加
- [ ] 接続プール・リトライ・ヘルスチェック

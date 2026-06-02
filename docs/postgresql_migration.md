# PostgreSQL 移行準備（Phase 161–180）

## SQLite との主な違い

| 項目 | SQLite（現状 RC1） | PostgreSQL（本番推奨） |
|------|-------------------|------------------------|
| 同時書き込み | 単一ライター | マルチクライアント |
| 型 | 動的 | 厳密スキーマ |
| バックアップ | ファイルコピー | `pg_dump` / WAL |
| 接続 | ファイルパス | `DATABASE_URL=postgresql://...` |

## スキーマ移行

1. `server/src/db/schema*.sql` を PostgreSQL DDL に変換（`datetime('now')` → `NOW()` 等）
2. `better-sqlite3` を `pg` または Prisma に差し替え
3. マイグレーションは Flyway / 自前 SQL 順序実行

## データ移行

```bash
# 概念手順（実装は Phase 181+）
sqlite3 data/tisly_notifications.db .dump > export.sql
# → PostgreSQL 向けに変換して import
```

## バックアップ / リストア

- **本番**: 日次 `pg_dump -Fc` を QNAP へ
- **リストア**: `pg_restore` をステージングで検証後、本番切替

## Docker 構成案

```yaml
services:
  tisly-api:
    image: tisly/server:rc1
    environment:
      DATABASE_URL: postgresql://tisly:***@db:5432/tisly
  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
```

## 推奨

- **PoC / 営業デモ**: SQLite のまま可
- **VPS 実証運用**: PostgreSQL + TLS + JWT + Mosquitto TLS

# Demo Reset（Phase 821–860）

## 概要

営業前に **ワンクリック** でデモ環境を既定状態へ戻します。

## 処理内容

1. デモタイムライン・図面ピン・KPI 案件・現調アップロードの削除
2. デモ顧客パック再シード
3. KPI 案件・30日履歴・フロアマップ再生成

## API

```http
POST /api/demo-kit/reset
```

レスポンス例:

```json
{
  "ok": true,
  "customers": { "customers": 5, "seeded": ["TOMS001", "..."] },
  "timeline": { "events": 40, ... },
  "floorMaps": { "layers": 15, "pins": 50 },
  "kpi": { "projects": 6 },
  "at": "2026-06-04T..."
}
```

## 実装

- `server/src/demo-kit/demo-reset.ts`

## 注意

本番 DB では管理者のみ実行してください。テストは専用 `TISLY_DB_PATH` を使用します。

# Project Timeline (Phase 621–660)

## テーブル

`business_project_timeline`

## イベント種別

案件作成、現調、図面、AI見積、見積送信、施工開始/完了、完了報告、請求、入金、保守開始/完了、PRO運用。

## API

| 操作 | メソッド |
|------|----------|
| 一覧 | `GET /api/toms/projects/:id/timeline` |
| 追加 | `POST /api/toms/projects/:id/timeline` |

案件作成・Business ワークフロー遷移時に自動追記されます。

# TOMS Workflow Engine (Phase 621–660)

## 状態

`draft` → `survey` → `estimate` → `approved` → `construction` → `completed` → `invoiced` → `paid` → `maintenance` → `closed`

## API

| 操作 | メソッド |
|------|----------|
| 現在状態 | `GET /api/toms/projects/:id/workflow` |
| 遷移 | `POST /api/toms/projects/:id/workflow/transition` body: `{ "to": "survey" }` |

## 履歴

`toms_workflow_history` に全遷移を保存。Business PWA の `POST .../status` でも自動記録。

## Business ステータス対応

| TOMS | Business |
|------|----------|
| draft | new |
| survey | survey_scheduled / survey_done |
| estimate | estimate_created |
| approved | estimate_sent |
| construction | construction_scheduled |
| completed | construction_done |
| invoiced | invoice_created / invoice_sent |
| paid | paid |
| closed | closed |

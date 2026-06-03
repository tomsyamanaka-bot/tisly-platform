# Maintenance Flow

## API

- `GET /api/toms/projects/:id/maintenance`
- `POST /api/toms/projects/:id/maintenance/create`
- `POST /api/toms/projects/:id/maintenance/:caseId/close`

## テーブル

`toms_project_maintenance` — 保守予定日、内容、対象設備、作業写真、対応者、完了状態

## タイムライン

作成 → `maintenance_start`、完了 → `maintenance_complete`

# Survey Production System (Phase 481–500)

## API

| Method | Path | 説明 |
|--------|------|------|
| GET/POST | `/api/survey/projects` | 一覧 / 作成 |
| GET/PATCH/DELETE | `/api/survey/projects/:projectId` | 詳細 / 更新 / 削除 |
| POST/GET | `/api/survey/projects/:projectId/photos` | 写真アップロード / 一覧 |
| POST/GET/DELETE | `/api/survey/drawing` | 手書き図面（jpg/png/pdf） |
| GET/PUT | `/api/survey/projects/:projectId/checklist` | 現調チェックリスト |
| POST | `/api/survey/projects/:projectId/ai-estimate` | AI見積候補（placeholder） |
| POST | `/api/survey/drawing/:id/import-pro` | 現調図面 → PRO フロア層 |

## 認証

`surveyor` 以上（`toms001.surveyor` / 管理者）。

## ストレージ

- 写真: `uploads/survey/{project_id}/{type}/`
- 図面: `uploads/survey/{project_id}/drawings/`

## PWA

`/survey` — GPS、オフラインキュー（案件 PATCH）

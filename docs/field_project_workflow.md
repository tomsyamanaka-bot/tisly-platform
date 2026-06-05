# Field Project Workflow — Phase 1161–1200

現調開始前から引渡しまでの1案件ワークフローです。

```mermaid
flowchart LR
  A[/field/new] --> B[Survey PWA]
  B --> C[AI v2]
  C --> D[Estimate Draft v2]
  D --> E[施工PWA]
  E --> F[Checklist RC2]
  F --> G[PRO Remote]
  G --> H[Google TV]
  H --> I[Handover]
```

## エントリ

**Field Project Wizard** (`POST /api/field/projects/create`)

同時生成:

- `survey_projects`（SVY-*）
- `business_projects`（BIZ-*）
- `business_project_timeline`（案件作成・現調予定）

## 紐付け

`field_projects` テーブルが Survey / Business ID を保持。

## 画面導線

| 段階 | 画面 |
|------|------|
| 案件作成 | `/field/new` |
| 現調 | `/survey` |
| 見積 | `/business/projects/:id/estimate-draft` |
| 施工 | `/customer/:code/install/home` |
| チェック | `/deployment/checklist/:projectId` |
| 監視 | `/customer/:code/pro-remote` |
| TV | `/tv/:code` |
| 引渡し | `/customer/:code/handover` |

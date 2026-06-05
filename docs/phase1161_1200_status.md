# Phase 1161–1200 Status — Field Deployment RC2 / First Real Customer Trial

**完了日**: 2026-06-05  
**前提**: Phase 1121–1160 完了済み

## 概要

初回顧客導入を想定し、現調PWA・施工PWA・Business・PRO Remote・Google TV を1案件で最初から最後まで追える RC2 状態に引き上げ。

## 実装一覧

| Phase | 領域 | 主要ファイル |
|-------|------|-------------|
| 1161–1165 | Field Project Wizard | `field-project-store.ts`, `/field/new` |
| 1166–1170 | AI現調解析 v2 | `ai-survey-analysis-v2.ts` |
| 1171–1175 | 見積ドラフト v2 | `estimate-draft-v2.ts` |
| 1176–1180 | Deployment Checklist RC2 | `deployment-checklist-rc2.ts` |
| 1181–1185 | PRO Remote Floor Stack RC2 | `floor-stack-rc2.ts` |
| 1186–1190 | Google TV Focus Camera RC2 | `tv-focus-state.ts`, `tv-dashboard.js` |
| 1191–1195 | Customer Handover Package | `customer-handover.ts` |
| 1196–1200 | ドキュメント・テスト | 本ファイル群 · `phase1161-1200.test.ts` |

## API 一覧

| メソッド | パス | 認証 |
|----------|------|------|
| POST | `/api/field/projects/create` | surveyor+ |
| GET | `/api/field/projects/:id` | surveyor+ |
| POST | `/api/ai/survey-analysis-v2` | surveyor+ |
| GET | `/api/ai/survey-analysis-v2/:projectId` | surveyor+ |
| POST | `/api/business/projects/:id/estimate-draft` | manager+ |
| GET | `/api/business/projects/:id/estimate-draft` | manager+ |
| PATCH | `/api/business/estimate-draft/:id` | manager+ |
| GET | `/api/deployment/checklist/:projectId` | installer+ |
| POST | `/api/deployment/checklist/:projectId/item/:itemId/complete` | installer+ |
| GET | `/api/customer/:code/pro-remote/floor-stack?rc=2` | viewer+ |
| POST | `/api/customer/:code/pro-remote/focus` | viewer+ |
| POST | `/api/tv/focus-camera` | なし |
| GET | `/api/tv/:code/state` | なし |
| GET | `/api/customer/:code/handover` | viewer+ |

## DB テーブル（新規）

| テーブル | 用途 |
|----------|------|
| `field_projects` | ウィザード案件メタ |
| `survey_analysis_v2` | AI現調解析 v2 |
| `business_estimate_drafts_v2` | 見積ドラフト v2 |
| `deployment_checklist_rc2` | 初回導入チェックリスト |

## UI ルート

| パス | 用途 |
|------|------|
| `/field/new` | 現調案件ウィザード |
| `/business/projects/:id/estimate-draft` | 見積ドラフト v2 |
| `/deployment/checklist/:projectId` | 施工チェックリスト RC2 |
| `/customer/:code/handover` | 引渡しパッケージ |
| `/customer/:code/pro-remote` | PRO Remote（RC2 floor stack） |
| `/tv/:code` | Google TV（focus camera RC2） |

## テスト

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

- `server/test/phase1161-1200.test.ts`

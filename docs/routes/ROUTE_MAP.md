# TiSLY PWA Route Map

**最終更新:** 2026-06-22  
**ソース:** `server/src/app.ts` · `server/src/pwa/pwa-route-catalog-v1.ts`

実務 PWA の正式 URL 一覧。旧 URL は Phase3 リダイレクトで後方互換。

---

## 実務 PWA（Practical）

| パス | 画面 | HTML |
|------|------|------|
| `/app` | App Hub | `app-hub.html` |
| `/schedule-v1` | 日程調整 | `schedule-v1.html` |
| `/schedule-v1/day` | 日程詳細 | `schedule-day-v1.html` |
| `/survey-v1` | 現調 v1 | `survey-v1.html` |
| `/survey-drawing-v1` | 現調図面エディタ | `survey-drawing-v1.html` |
| `/estimate-v1` | 見積・請求・完了報告 | `estimate-v1.html` |
| `/projects-v1` | 現場・書類 | `projects-v1.html` |
| `/field-check-v1` | 持ち物チェック | `field-check-v1.html` |
| `/field-checklist-v1` | 現場チェックリスト | `field-checklist-v1.html` |
| `/checklist-templates-v1` | チェックリスト管理 | `checklist-templates-v1.html` |
| `/purchase-v1` | 発注 | `purchase-v1.html` |
| `/project-dashboard-v1` | 案件ダッシュボード | `project-dashboard-v1.html` |
| `/project-mgmt-v1` | 案件管理一覧 | `project-mgmt-v1.html` |
| `/project-mgmt-detail-v1` | 案件管理詳細 | `project-mgmt-detail-v1.html` |
| `/documents-v1` | Document Center | `documents-v1.html` |
| `/search-v1` | 横断検索 | `search-v1.html` |
| `/settings-v1` | 設定 | `settings-v1.html` |
| `/storage-settings-v1` | ストレージ設定 | `storage-settings-v1.html` |
| `/master-v1` | 見積マスター | `master-v1.html` |
| `/google-calendar-settings-v1` | Googleカレンダー | `google-calendar-settings-v1.html` |
| `/google-calendar-settings-v2` | Googleカレンダー v2 | `google-calendar-settings-v2.html` |
| `/project-automation-admin-v1` | 自動化管理 | `project-automation-admin-v1.html` |

---

## Monitoring

| パス | 画面 |
|------|------|
| `/monitoring-3d-v2` | TiSLY Monitoring 3D V3.4 |
| `/monitoring-map-assets-v1` | mapAsset Manager V3.2 |
| `/tisly-monitoring-3d-v1` | Monitoring 3D V1 |
| `/tisly-monitoring-home-v1` | Monitoring Home |
| `/tisly-monitoring-plant-v1` | Monitoring Plant |
| `/tisly-monitoring-3d-v3` | → `/monitoring-3d-v2` リダイレクト |

---

## Knowledge

| パス | 画面 |
|------|------|
| `/knowledge-search-v1` | ナレッジ検索 |
| `/knowledge-field-v1` | 現場ナレッジ |
| `/knowledge-detail-v1` | ナレッジ詳細 |
| `/knowledge-usage-dashboard-v1` | 使用ログ |
| `/knowledge-customer-v1` | お客様向け |
| `/knowledge-customer-v2` | お客様向け V2 |
| `/knowledge-customer-project-v1` | お客様案件 |
| `/knowledge-customer-site-map-v1` | Site Map |
| `/knowledge-customer-projects-v1` | 案件一覧 |
| `/knowledge-customer-document-v1` | PDF閲覧 |
| `/knowledge-customer-detail-v1` | 詳細 |
| `/knowledge-candidates-v1` | 候補 |
| `/knowledge-quick-v1` | クイック |
| `/mothership-explorer-v1` | MotherShip |

---

## 診断

| パス | 用途 |
|------|------|
| `/route-map` | 開発用ルート表 |
| `/route-health` | ルート診断（✅/❌/⚠） |

---

## 旧 URL → 新 URL（後方互換リダイレクト）

| 旧 | 新 |
|----|-----|
| `/estimate` | `/estimate-v1` |
| `/invoice` | `/estimate-v1?tab=invoice` |
| `/drawing-editor` | `/survey-drawing-v1` |
| `/survey` | `/survey-v1` |
| `/projects` | `/projects-v1` |
| `/materials` | `/field-check-v1` |
| `/materials-v1` | `/field-check-v1` |

レガシー現調 PWA（旧 `/survey` HTML）は `/survey-legacy` のみ。

---

## クエリ引継ぎ例

| 画面 | 例 |
|------|-----|
| 見積 deep link | `/estimate-v1?projectId=MO-26-0620-001` または `?project=` |
| 請求タブ | `/estimate-v1?tab=invoice` |
| 現調 | `/survey-v1?projectId=` または `?project=` |
| 図面 | `/survey-drawing-v1?projectId=&siteId=&customerId=` |

---

## 関連 API

| パス | 用途 |
|------|------|
| `/api/survey/v1` | 現調 |
| `/api/estimate/v1` | 見積 |
| `/api/projects/v1` | 現場・PDF |
| `/api/materials/v1` | 材料マスタ（API のみ・ページなし） |
| `/api/health` | デプロイ確認 |

---

## 確認コマンド

```bash
curl -sI https://tisly.jp/estimate | findstr /i location
curl -sI https://tisly.jp/drawing-editor | findstr /i location
curl -s https://tisly.jp/route-health
```

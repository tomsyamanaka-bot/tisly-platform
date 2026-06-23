# TiSLY PWA URL 契約（Route Contract）

**最終更新:** 2026-06-24（Phase17）  
**ルール:** URL を変更・追加したら **必ずこのファイルを更新** し、`/route-health` で旧URLリダイレクトを確認する。

---

## 実務 PWA — 現行 URL

| 画面名 | 正式 URL | 下部ナビ |
|--------|----------|----------|
| App Hub | `/app` | — |
| Route Health | `/route-health` | — |
| 日程調整 | `/schedule-v1` | `/schedule-v1` |
| 現調 | `/survey-v1` | `/survey-v1` |
| 現調図面 | `/survey-drawing-v1` | — |
| 見積 | `/estimate-v1` | `/estimate-v1` |
| 請求（見積タブ） | `/estimate-v1?tab=invoice` | `/estimate-v1?tab=invoice` |
| 案件一覧 | `/projects-v1` | `/projects-v1` |
| 案件ダッシュボード | `/project-dashboard-v1` | — |
| 案件詳細（実運用） | `/project-mgmt-detail-v1?projectId=` | — |
| 書類センター | `/document-center-v1` | — |
| 書類センター（別名） | `/documents-v1` | — |
| 書類閲覧 | `/document-viewer-v1.html?projectId=&kind=` | — |
| 現場チェックリスト | `/field-checklist-v1` | `/field-checklist-v1`（現場） |
| 材料チェック | `/field-check-v1` | `/field-check-v1`（材料） |
| 発注タブ | `/field-check-v1?tab=orders` | `/field-check-v1?tab=orders`（発注） |
| 発注管理 | `/purchase-v1` | —（発注タブからリダイレクト可） |

---

## 旧 URL → リダイレクト（301 永久）

| 旧 URL | リダイレクト先 | 実装 |
|--------|----------------|------|
| `/estimate` | `/estimate-v1` | `pwa-legacy-redirects.ts` |
| `/invoice` | `/estimate-v1?tab=invoice` | 同上 |
| `/drawing-editor` | `/survey-drawing-v1` | 同上 |
| `/survey` | `/survey-v1` | 同上 |
| `/projects` | `/projects-v1` | 同上 |
| `/materials` | `/field-check-v1` | 同上 |
| `/materials-v1` | `/field-check-v1` | 同上 |
| `/purchase` | `/field-check-v1?tab=orders` | 同上（Phase17） |

**404 禁止** — 上記旧 URL は必ず現行 URL へ誘導する。

---

## 書類閲覧 — 戻る動作

| 画面 | return パラメータ | フォールバック |
|------|-------------------|----------------|
| `document-viewer-v1.html` | `return` または `returnUrl`（`/` 始まり） | `/document-center-v1?projectId=` |
| 見積 PWA から開く | `return=/estimate-v1?...` を付与 | — |
| 案件詳細から開く | `return=/project-mgmt-detail-v1?...` を付与 | — |

ブラウザ履歴（`history.back()`）は **使わない**。

---

## Service Worker / キャッシュ

| 項目 | 値（Phase17） |
|------|----------------|
| SW_VERSION | `tisly-pwa-v2400-phase17` |
| OFFLINE_CACHE | `tisly-pwa-shell-v2400-phase17` |
| 復旧 | `/route-health` →「更新してください」→ cache 削除 + SW 解除 + reload |

---

## 変更手順チェックリスト

1. `server/src/pwa/pwa-legacy-redirects.ts` に旧 URL リダイレクト追加
2. `server/public/js/tisly-practical-nav.js` 下部ナビ URL 確認
3. `server/public/service-worker.js` の `SW_VERSION` / cache 名を更新
4. 本ファイル（ROUTE_CONTRACT.md）を更新
5. `/route-health` で全ルート HTTP 200 を確認

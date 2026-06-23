# TiSLY PWA URL 契約（Route Contract）

**最終更新:** 2026-06-24（Phase18）  
**ルール:** URL を変更・追加したら **必ずこのファイルを更新** し、`/route-health` で旧URLリダイレクトを確認する。

---

## ゾーン分離（絶対ルール）

| ゾーン | 入口 | 用途 |
|--------|------|------|
| **社内** | `/app` | TOMS 社内専用 PWA |
| **お客様** | `/customer` | お客様専用ポータル（PWA `start_url`） |

- `/customer` から `/app` への導線は **作らない**
- `/customer` では見積・請求・案件管理・材料・発注など社内事務 PWA を **表示しない**
- お客様にホーム画面追加してもらう URL は **https://tisly.jp/customer** のみ

---

## 社内 PWA — 正式 URL

| 画面名 | 正式 URL |
|--------|----------|
| App Hub | `/app` |
| Route Health | `/route-health` |
| 日程調整 | `/schedule-v1` |
| 現調 | `/survey-v1` |
| 現調図面 | `/survey-drawing-v1` |
| 見積 | `/estimate-v1` |
| 請求（見積タブ） | `/estimate-v1?tab=invoice` |
| 案件一覧 | `/projects-v1` |
| 案件ダッシュボード | `/project-dashboard-v1` |
| 案件詳細（実運用） | `/project-mgmt-detail-v1?projectId=` |
| 書類センター | `/document-center-v1` |
| 現場チェックリスト | `/field-checklist-v1` |
| 材料チェック | `/field-check-v1` |
| 発注タブ | `/field-check-v1?tab=orders` |

コード単一ソース: `server/src/shared/routes/tisly-routes-v1.ts`

---

## お客様ポータル — 正式 URL

| 画面名 | 正式 URL |
|--------|----------|
| お客様ポータル入口 | `/customer` |
| お客様案件一覧 | `/customer/:customerCode` |
| お客様案件詳細 | `/customer/project/:shareId` |
| お客様資料閲覧 | `/customer/document/:shareId` |
| お客様監視画面 | `/customer/monitoring/:shareId` |

PWA manifest: `/manifest-customer-v1.webmanifest`（`start_url: /customer`）

表示するもの: 物件名 · 工事内容 · 現場写真 · 仕様書PDF · 完了報告書PDF · お客様向け説明 · 監視リンク · 連絡先

表示しないもの: 見積作成 · 請求書 · 案件管理 · 粗利 · 材料 · 発注 · 社内メモ · QNAP/WebDAV/API URL · projectId · debug

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
| `/purchase` | `/field-check-v1?tab=orders` | 同上 |
| `/customer-portal` | `/customer` | 同上 |
| `/customer-portal/:code` | `/customer/:code` | 同上 |

**404 禁止** — 上記旧 URL は必ず現行 URL へ誘導する。

旧 PRO Remote ポータル: `/customer/:customerCode/portal`（レガシー）

---

## 書類閲覧 — 戻る動作

| 画面 | return パラメータ | フォールバック |
|------|-------------------|----------------|
| `document-viewer-v1.html` | `return` または `returnUrl` | `/document-center-v1?projectId=` |
| お客様資料 | — | `/customer/project/:shareId` |

ブラウザ履歴（`history.back()`）は **使わない**。  
コード: `server/src/shared/navigation/document-return-v1.ts`

---

## React Native 流用 — shared モジュール

| パス | 内容 |
|------|------|
| `server/src/shared/routes/` | URL 定義 |
| `server/src/shared/business/` | 案件ステータス計算 |
| `server/src/shared/pdf/` | PDF データ構造 |
| `server/src/shared/customer/` | お客様表示データ整形 |
| `server/src/shared/navigation/` | 戻り先ロジック |
| `server/src/shared/ui-models/` | 画面文言 |

---

## Service Worker / キャッシュ

| 項目 | 値（Phase18） |
|------|----------------|
| SW_VERSION | `tisly-pwa-v2400-phase18` |
| OFFLINE_CACHE | `tisly-pwa-shell-v2400-phase18` |
| 復旧 | `/route-health` →「更新してください」→ cache 削除 + SW 解除 + reload |

---

## 変更手順チェックリスト

1. `server/src/shared/routes/tisly-routes-v1.ts` に正式 URL 追加
2. `server/src/pwa/pwa-legacy-redirects.ts` に旧 URL リダイレクト追加
3. `server/public/js/tisly-practical-nav.js` 下部ナビ URL 確認
4. `server/public/service-worker.js` の `SW_VERSION` / cache 名を更新
5. 本ファイル（ROUTE_CONTRACT.md）を更新
6. `server/test/operational-phase18-v1.test.ts` を実行
7. `/route-health` で全ルート HTTP 200 を確認

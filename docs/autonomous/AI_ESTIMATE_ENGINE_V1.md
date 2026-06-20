# AI見積エンジン基盤 v1

**最終更新:** 2026-06-20  
**画面:** `/master-v1`（`/ai-estimate-engine-v1` → 統計タブへリダイレクト）  
**API:** `/api/ai-estimate-engine/v1/*`

---

## 目的

将来の AI 自動見積の土台。マスターデータ・単価ルール・統計・Document Center 連携を一元化。

---

## Phase 一覧

| Phase | リソース | 説明 |
|-------|---------|------|
| 1 | `customer-master` | 顧客名・区分・標準掛率・値引率・人工単価・出張費 |
| 2 | `rank-master` | S/A/B/C ランク — 掛率・粗利率・値引率 |
| 3 | `work-master` | 作業 — カテゴリ・標準人工・時間・単価 |
| 4 | `material-master` | 材料 — カテゴリ・メーカー・型番・仕入先・原価・売価 |
| 5 | `customer-price-override` | 顧客×作業/材料の単価上書き |
| 6 | スマホ UI | `/master-v1` — 連続入力・保存して次へ・⭐お気に入り |
| 7 | `stats` | 作業/材料数・原価/売価未設定一覧 |
| 8 | `document-center/:projectId` | Document Viewer 連携コンテキスト |

---

## DB 拡張（`migration:ai_estimate_engine_v1`）

既存 `master_v1_*` テーブルに列追加:

| テーブル | 追加列 |
|---------|--------|
| `master_v1_customers` | `customer_type`, `standard_markup_rate`, `standard_discount_rate`, `standard_labor_unit_price`, `standard_travel_fee` |
| `master_v1_ranks` | `gross_margin_rate`, `discount_rate` + S/A/B/C シード |
| `master_v1_work_items` | `standard_labor`, `standard_hours` |

---

## API 例

```http
GET /api/ai-estimate-engine/v1/stats
GET /api/ai-estimate-engine/v1/customer-master
POST /api/ai-estimate-engine/v1/work-master
GET /api/ai-estimate-engine/v1/document-center/{projectId}
```

---

## コード参照

| 領域 | パス |
|------|------|
| サービス | `server/src/master/ai-estimate-engine-v1.ts` |
| API | `server/src/api/routes/ai-estimate-engine-v1.ts` |
| UI | `server/public/master-v1.html`, `js/master-v1.js` |
| テスト | `server/test/ai-estimate-engine-v1.test.ts` |
| スクショ | `server/scripts/capture-ai-estimate-engine-v1-screenshots.mjs` |

---

## 仮値・課題（人間が後で差し替え）

- 標準人工単価 8,000円 / 出張費 5,000円 — 実務単価に更新
- S/A/B/C ランクの粗利率・値引率 — 営業方針に合わせ調整
- 顧客名マッチング（Document Center）— 完全一致優先、部分一致は仮
- AI 自動見積生成本体 — 次フェーズ

---

## 関連

- [MASTER_V1.md](./MASTER_V1.md)
- [PROJECT_STATUS.md](./PROJECT_STATUS.md)

# 見積PWA v1

実務向け見積PWA。現調PWA v1 から引き渡された案件を見積化し、明細編集・税込計算・PDF生成まで行う。

## URL

| 画面 | URL |
|------|-----|
| 見積PWA v1 | `/estimate-v1` |
| App Hub | `/app` → 「見積 v1」カード |

## API (`/api/estimate/v1`)

認証: `surveyor` / `manager` / `super_admin`

| Method | Path | 説明 |
|--------|------|------|
| GET | `/pending-surveys` | 見積待ち現調案件一覧 |
| GET | `/projects` | 見積案件一覧 |
| POST | `/from-survey/:surveyProjectId` | 現調から見積案件作成 |
| GET | `/projects/:id` | 見積詳細 |
| PATCH | `/projects/:id/items` | 明細更新・税計算（`shuseiDiscount` / `shuseiDiscountMemo` 対応） |
| POST | `/projects/:id/finalize` | 確定 + PDF + `estimate_done` |
| GET | `/projects/:id/pdf` | PDF/HTML プレビュー |
| GET | `/projects/:id/toms-format` | TOMS標準フォーマット（スタブ） |

## 現調との連携

1. 現調PWA v1 で「見積へ渡す」→ `workflow_status = estimate_pending`
2. 見積PWA v1 で案件をタップ → `business_projects` 作成
3. `survey_materials` → `business_estimates.items_json` にシード
4. `survey_handoff_log.business_project_id` を更新
5. 確定時に `workflow_status = estimate_done`

## 顧客別単価ルール（Customer Price Rule v1）

- 部材原価 × `costMultiplier` = 材料販売単価
- 労務原価 × `laborMultiplier` = 労務販売単価
- 最終調整は **出精値引き**（`shusei_discount_amount` / `shusei_discount_memo`）で行う
- 計算順: 明細合計 − 出精値引き = 小計 → 消費税 → 税込合計

シード例: 客A×2.0 / 客B×3.0 / 管理会社A×1.8 / 一般個人×2.5 / 法人標準×2.2

## DB

| テーブル | 用途 |
|----------|------|
| `customer_price_rules` | 顧客別倍率（`rule_name`, `cost_multiplier`, `labor_multiplier`） |
| `business_estimates` | 出精値引き列（`shusei_discount_amount`, `shusei_discount_memo`） |

マイグレーション: `migration:customer_price_rules_v1`

## オフライン（後回し）

設計のみ。Service Worker / IndexedDB 同期は Phase C 以降で検討。

## テスト

```bash
cd server
npx tsx --test test/estimate-v1.test.ts
npx tsx --test test/customer-price-rules.test.ts
```

## ログイン例

- 顧客コード: `TOMS001`
- ユーザー: `toms001.surveyor`
- パスワード: デモ環境の `CUSTOMER_DEMO_PASSWORD`

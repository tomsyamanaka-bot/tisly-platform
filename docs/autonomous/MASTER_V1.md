# 見積マスター v1 — 仕様

**最終更新:** 2026-06-18  
**画面:** `/master-v1`  
**API:** `/api/master/v1/*`

---

## 目的

現調図面 → AI清書 → 見積生成パイプラインの **見積マスター基盤** を提供する。

| マスター | 説明 |
|---------|------|
| 顧客マスター | 見積先顧客・担当者・ランク紐付け |
| ランクマスター | 材料/労務倍率（顧客ランク） |
| 作業マスター | 工事作業単価 |
| 材料マスター | 部材原価 |
| 顧客別単価 | 顧客×作業/材料の個別単価 |
| 記号マッピング | 現調図面記号/線種 → 作業・材料 |

---

## 現調図面との接続

`master_v1_symbol_mappings` テーブルで現調図面 v2 の `symbolType` / `lineType` を作業・材料に紐付け。

| 記号/線種 | 作業 | 材料 |
|----------|------|------|
| dome_camera / bullet_camera / camera | カメラ設置 | ドーム/バレットカメラ |
| lan_port | LAN配線 | LANケーブル |
| access_point | AP設置 | 無線AP |
| nvr | NVR設定 | 4ch NVR |
| lan (線種) | LAN配線 | LANケーブル（延長m換算） |

---

## AI見積生成準備

`GET /api/master/v1/estimate-preview?sketchId=…`  
`POST /api/master/v1/estimate-preview`（layers JSON 直接）

現調図面 JSON から **作業候補** / **材料候補** を抽出（正式見積生成は次フェーズ）。

---

## StorageProvider 層

| Provider | 状態 |
|----------|------|
| local | インターフェース実装済み |
| webdav | モック/設定確認のみ |
| qnap | モック/設定確認のみ |

`POST /api/master/v1/storage-providers/test`

---

## スマホ運用

- iPhone 優先 UI（下部タブ・44px タッチターゲット）
- よく使う登録（favorite）
- 検索・カテゴリフィルタ
- CSV 入出力（顧客/作業/材料）
- 一括編集（favorite / active）

---

## DB テーブル

- `master_v1_customers`
- `master_v1_ranks`
- `master_v1_work_items`
- `master_v1_materials`
- `master_v1_customer_prices`
- `master_v1_symbol_mappings`

マイグレーション: `migration:master_v1`

---

## コード参照

| 領域 | パス |
|------|------|
| 型 | `server/src/master/master-v1-types.ts` |
| Store | `server/src/master/master-v1-store.ts` |
| 見積プレビュー | `server/src/master/estimate-preview-service.ts` |
| CSV | `server/src/master/master-v1-csv.ts` |
| StorageProvider | `server/src/storage/storage-provider.ts` |
| API | `server/src/api/routes/master-v1.ts` |
| UI | `server/public/master-v1.html`, `js/master-v1.js` |
| テスト | `server/test/master-v1.test.ts` |

---

## 関連

- [SURVEY_DRAWING_V1.md](./SURVEY_DRAWING_V1.md)
- [SURVEY_AI_PIPELINE_V1.md](./SURVEY_AI_PIPELINE_V1.md)

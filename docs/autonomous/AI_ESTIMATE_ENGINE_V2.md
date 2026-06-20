# AI見積エンジン v2

**最終更新:** 2026-06-20  
**画面:** `/master-v1?tab=estimate-preview`  
**API:** `/api/master/v1/estimate-preview`（v2 デフォルト）, `/api/ai-estimate-engine/v1/candidates-v2`

---

## 目的

現調図面・案件テンプレ・Document Center から見積候補（作業/材料/数量/単価/粗利）を自動生成し、スマホで確認して見積書へ反映する実務フロー。

---

## Phase 一覧

| Phase | 内容 | 状態 |
|-------|------|------|
| 1 | 現調図面 → 記号/SVG/layer/path/lineType から候補抽出 | ✅ |
| 2 | 配線長推定（mmPerPx 仮値・余長1.2×・数量切り上げ） | ✅ |
| 3 | 見積候補プレビュー v2（作業/材料/未設定/警告・ON/OFF・編集） | ✅ |
| 4 | 価格計算（顧客上書き→ランク→標準→原価×2→警告） | ✅ |
| 5 | 見積書へ反映（ドラフト保存・新規作成・既存追加） | ✅ |
| 6 | 防犯カメラ案件テンプレ連携（重複排除） | ✅ |
| 7 | Document Center source_type 構造 | ✅（参照のみ・AI解析は将来） |
| 8 | テスト・スクショ・検証レポート | ✅ |

---

## 記号マッピング例

| 記号 | 作業 | 材料 |
|------|------|------|
| dome_camera | ドームカメラ設置 | ドームカメラ + LAN/RJ45/防水ボックス |
| lan_port | LAN配線 | LANケーブル |
| nvr | NVR設定 | NVR |
| access_point | AP設置 | 無線AP |
| lan 線種 | LAN配線 | LANケーブル（延長m換算） |

未マッピング記号 → `unmappedLines` に表示（警告付き）

---

## 配線長換算（仮値）

| 定数 | 値 | 説明 |
|------|-----|------|
| `DEFAULT_MM_PER_PX` | 2.0 | 1px = 2mm（図面スケール未設定時） |
| `WIRE_WASTE_FACTOR` | 1.2 | 余長率 |
| 数量 | `Math.ceil(m)` | 切り上げ |

---

## API 例

```http
GET /api/master/v1/estimate-preview?sketchId={id}&customerId={id}
GET /api/ai-estimate-engine/v1/candidates-v2?sketchId={id}
POST /api/master/v1/estimate-preview/apply
PATCH /api/master/v1/estimate-drafts/{id}
POST /api/master/v1/estimate-drafts/{id}/apply-to-estimate
  body: { "mode": "create" | "append", "businessProjectId": "..." }
```

---

## コード参照

| 領域 | パス |
|------|------|
| v2 サービス | `server/src/master/ai-estimate-engine-v2.ts` |
| 候補抽出・価格 | `server/src/master/estimate-preview-service.ts` |
| 見積反映 | `server/src/master/master-v1-estimate-apply-service.ts` |
| UI | `server/public/js/master-v1.js`, `master-v1.css` |
| テスト | `server/test/ai-estimate-engine-v2.test.ts` |
| スクショ | `server/scripts/capture-ai-estimate-engine-v2-screenshots.mjs` |

---

## 仮値・残課題（人間が後で差し替え）

| 項目 | 現状 | 人間がやること |
|------|------|----------------|
| mmPerPx | 2.0 固定仮値 | 図面スケール入力 UI / 案件ごと保存 |
| 余長率 | 1.2 固定 | 工事種別・顧客別ルール |
| 防犯テンプレ作業 | work ID 固定6件 | テンプレ管理 UI と統合 |
| Document Center AI | placeholder のみ | 仕様書写真/PDF の AI 解析 |
| 既存見積へ追加 | businessProjectId 要 | 案件選択 UI |
| 動作確認作業 | 録画試験 work を代理 | 専用作業マスター登録 |
| QNAP / Google / PDF | 変更なし | — |

---

## 関連

- [AI_ESTIMATE_ENGINE_V1.md](./AI_ESTIMATE_ENGINE_V1.md)
- [PROJECT_STATUS.md](./PROJECT_STATUS.md)

# 現調図面 v1/v2 — 仕様

**最終更新:** 2026-06-18  
**画面:** `/survey-drawing-v1`  
**API:** `/api/survey/v1/drawing-sketches/*`

---

## 目的

方眼紙に描いた手書き図面を写真で取り込み、AI 清書前提の下書きとして扱い、その上に配線ルート・記号・線・メモをスマホ / Android タブレットでプロットする。

## v2 スコープ（実装済み — AI清書接続準備）

| 機能 | 状態 |
|------|------|
| iPhone / Android タブレット対応 | ✅ タッチ + pointer |
| 図面データ構造 v2 | ✅ `schemaVersion: 2` |
| 設備記号ライブラリ v1 | ✅ SVG 17種、ドラッグ/回転/削除 |
| 配線ルート（線種） | ✅ LAN/100V/24V/RS485/同軸/電話 |
| 距離計算下準備 | ✅ `paths[].lengthPx` |
| AI清書用 JSON 出力 | ✅ ダウンロードボタン |
| AI パイプライン設計 | ✅ [SURVEY_AI_PIPELINE_V1.md](./SURVEY_AI_PIPELINE_V1.md) |

## v1 スコープ（実装済み）

| 機能 | 状態 |
|------|------|
| 指・タッチペン描画 | ✅ |
| 写真取り込み | ✅ `POST .../background` |
| 方眼紙画像の上に線 | ✅ SVG ストローク |
| 記号配置 | ✅ |
| テキストメモ | ✅ |
| 拡大縮小・移動 | ✅ ピンチ + ボタン + パンツール |
| 元画像と描画レイヤー分離 | ✅ |
| 保存 | ✅ PATCH + 自動保存 2s |
| 案件紐付け | ✅ `survey_projects.project_id` |

## 未実装（次フェーズ）

- AI 清書パイプライン本接続（API 送信）
- 見積明細への自動反映（estimate-preview → estimate_items）
- QNAP 図面バックアップ
- 実寸スケール（方眼紙グリッド認識）

## 見積マスター連携（v1 完成）

- 見積マスター PWA: `/master-v1` — [MASTER_V1.md](./MASTER_V1.md)
- 記号マッピング: `master_v1_symbol_mappings`
- 見積候補 API: `GET /api/master/v1/estimate-preview?sketchId=…`

## JSON 構造 v2（`layers_json`）

```json
{
  "schemaVersion": 2,
  "drawingVersion": 2,
  "canvasWidth": 1920,
  "canvasHeight": 1080,
  "paths": [{
    "id", "tool", "lineType", "color", "width",
    "points": [{ "x", "y" }], "lengthPx"
  }],
  "symbols": [{
    "id", "symbolType", "label", "icon", "svg", "color",
    "x", "y", "rotation", "scale", "memo"
  }],
  "notes": [{ "id", "text", "x", "y", "fontSize", "color" }],
  "viewport": { "scale", "offsetX", "offsetY" }
}
```

v1（`version: 1`）は読み込み時に v2 へ自動マイグレーション。

## AI清書用エクスポート

`GET /api/survey/v1/drawing-sketches/:sketchId/ai-export`  
UI: ツールバー 🤖 ボタン → JSON ダウンロード

## 入口

- 現調 PWA `/survey-v1` 案件詳細 →「現調図面」セクション
- 直接: `/survey-drawing-v1?projectId=SVY-…` または `?sketchId=…`

## コード参照

| 領域 | パス |
|------|------|
| 型 | `server/src/survey/survey-drawing-v1-types.ts` |
| Store | `server/src/survey/survey-drawing-v1-store.ts` |
| API | `server/src/api/routes/survey-v1.ts`（drawing-sketches ルート） |
| UI | `server/public/survey-drawing-v1.html`, `js/survey-drawing-v1.js` |
| AI 設計 | `docs/autonomous/SURVEY_AI_PIPELINE_V1.md` |
| テスト | `server/test/survey-drawing-v1.test.ts` |

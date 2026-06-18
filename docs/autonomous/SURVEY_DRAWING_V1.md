# 現調図面 v1 — 仕様（準備完了）

**最終更新:** 2026-06-18  
**画面:** `/survey-drawing-v1`  
**API:** `/api/survey/v1/drawing-sketches/*`

---

## 目的

方眼紙に描いた手書き図面を写真で取り込み、AI 清書前提の下書きとして扱い、その上に配線ルート・記号・線・メモをスマホ / Android タブレットでプロットする。

## v1 スコープ（実装済み）

| 機能 | 状態 |
|------|------|
| iPhone / Android タブレット対応 | ✅ タッチ + pointer |
| 指・タッチペン描画 | ✅ |
| 写真取り込み | ✅ `POST .../background` |
| 方眼紙画像の上に線 | ✅ SVG ストローク |
| 記号配置 | ✅ パレット 8 種 |
| テキストメモ | ✅ |
| 拡大縮小・移動 | ✅ ピンチ + ボタン + パンツール |
| 元画像と描画レイヤー分離 | ✅ `background_image_path` + `layers_json` |
| 保存 | ✅ PATCH + 自動保存 2s |
| 案件紐付け | ✅ `survey_projects.project_id` |
| AI 清書用 JSON | ✅ `layers.version === 1` |

## 未実装（次フェーズ）

- AI 清書パイプライン本接続
- 見積明細への自動反映
- QNAP 図面バックアップ

## JSON 構造（`layers_json`）

```json
{
  "version": 1,
  "strokes": [{ "id", "tool", "color", "width", "points": [{ "x", "y" }] }],
  "symbols": [{ "id", "symbolType", "label", "icon", "color", "x", "y", "rotation", "memo" }],
  "textMemos": [{ "id", "text", "x", "y", "fontSize", "color" }],
  "viewport": { "scale", "offsetX", "offsetY" }
}
```

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
| テスト | `server/test/survey-drawing-v1.test.ts` |

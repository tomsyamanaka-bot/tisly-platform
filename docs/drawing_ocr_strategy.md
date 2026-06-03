# Drawing OCR Strategy

## 現状 (Phase 501–520)

`server/src/survey/drawing-ocr.ts`

- 手書き図面ファイルを DB から読み込み
- メタ情報を `survey_drawing_ocr` に保存
- rule-based placeholder を返却

## API

`POST /api/survey/drawing/:drawingId/ocr`

## 返却例

```json
{
  "floors": ["外周", "1F", "2F"],
  "rooms": ["玄関", "廊下", "和室", "洋間", "WC"],
  "symbols": ["camera", "beam", "light", "aircon", "panel"]
}
```

## Phase 521+ 方針

1. OpenAI Vision / 専用 OCR API を `runDrawingOcr` 内で切替
2. 結果スキーマは現行 JSON を維持（フロント・PRO Map 連携を壊さない）
3. PDF 図面は rasterize 後に同一パイプラインへ

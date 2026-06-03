# AI見積 v3 (Phase 621–660)

## 入力

現調写真・メモ、施工図記号・ルート、チェックリスト。

## 推定

ESP数、ライト数、カメラ数、LAN距離(m)、施工日数。

## API

`POST /api/toms/projects/:id/ai-estimate-v3`  
`GET /api/toms/projects/:id/ai-estimate-v3/latest`

## 出力

TOMS標準見積候補（`business_ai_candidates` にも保存）。テンプレート行は ESP盤・Shelly照明・カメラ・LAN配線・施工人工。

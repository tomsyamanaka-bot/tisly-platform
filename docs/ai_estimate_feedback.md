# AI 見積 v3 学習準備（Phase 701–740）

## UI

案件司令塔 — **採用 / 修正 / 却下** ボタン（`dash-ai-estimate`）

## API

- `POST /api/toms/projects/:id/ai-estimate-v3/feedback`
- `GET .../feedback`

## DB

`ai_estimate_feedback` — `action`: adopted | revised | rejected

`candidate_json` に推奨行・信頼度を保存。本番 AI は mock（`ai-estimate-v3.ts` ヒューリスティック）のまま。

## タイムライン

フィードバック登録時に `AI見積 採用|修正|却下` を自動記録。

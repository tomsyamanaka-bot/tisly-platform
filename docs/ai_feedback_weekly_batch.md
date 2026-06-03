# External AI Feedback 週次バッチ（Phase 781–820）

## 概要

`ai_estimate_feedback` を週次（月曜 UTC 0:00 起点）で集計し、採用 / 修正 / 却下とよく直される項目を summary 化します。本番 AI は mock のまま（`AI_ESTIMATE_PROVIDER !== openai`）。

## 分割

- **顧客別** — `byCustomer[]`
- **業種別** — `candidate_json.industry` または `general`

## API

`GET /api/toms/ai-feedback/weekly-batch`（要認証）

## 実装

- `server/src/toms/ai-feedback-weekly-batch.ts`

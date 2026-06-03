# AI Feedback Learning（Phase 741–780）

## 概要

`ai_estimate_feedback` を集計し、次回 AI 見積候補にヒントを反映します（本番 AI は mock のまま）。

## 指標

- 採用率 / 修正率 / 却下率
- よく修正される項目（`revisedFields`）

## API

`GET /api/toms/ai-feedback/learning?projectId=`

## サービス

- `aggregateAiFeedbackLearning`
- `buildAiLearningCandidateHints`
- `applyLearningToAiEstimateCandidate` — `generateAiEstimateV3` で適用

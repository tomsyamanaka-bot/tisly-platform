# TiSLY AI Analytics Engine（Phase 81–100）

## 概要

TiSLY を **通知システム → 運用システム → 自律復旧システム** へ進化させる中核の一つです。  
イベントを分類し、リスクスコア（0–100）を算出し、自然言語レポートを生成します。

## モジュール

| ファイル | 役割 |
|---------|------|
| `server/src/analytics/analytics-engine.ts` | オーケストレーション・サマリー・NL レポート |
| `server/src/analytics/event-classifier.ts` | イベント分類・深夜帯判定 |
| `server/src/analytics/risk-score.ts` | リスクスコア・AI 優先度 |
| `server/src/analytics/trend-analyzer.ts` | 今日/週/月トレンド |

## リスクスコア例

| イベント | スコア目安 |
|---------|-----------|
| 窓開 1 回 | 10 |
| 深夜侵入 | 70 |
| 非常停止 | 90 |
| 複数同時 | 95 |

## AI 優先度

`info` / `warning` / `alarm` / `critical` — 通知サービスがタイトル・配信判断に利用。

## API

- `GET /api/analytics/overview`
- `GET /api/analytics/summary/:period` — today | week | month
- `GET /api/analytics/report/:period` — 自然言語レポート
- `GET /api/analytics/trends/:period`

## UI

- `/analytics` — Risk / Trend / Recovery / Incident / SLA
- `/sales` — 営業向け AI インサイト
- `/operations` — Analytics パネル連携

## 将来連携（TODO）

- OpenAI / Ollama — レポート品質向上
- QNAP AI / Camera AI — 映像相関
- Weather API — 誤報分析

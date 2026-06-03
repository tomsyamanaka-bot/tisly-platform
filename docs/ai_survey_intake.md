# AI Survey Intake (Phase 501–520)

## API

`POST /api/survey/:projectId/ai/intake`

認証: surveyor+

入力（任意）:

- `notes` — 現調メモ
- `gps` — `{ lat, lng }`

サーバー側で自動参照:

- 案件 (`survey_projects`)
- 写真 (`survey_photos`)
- 図面 (`survey_drawings`)
- チェックリスト (`survey_checklists`)

## 出力（placeholder / rule-based）

- `rooms`, `exterior_points`, `entry_points`
- `windows`, `doors`, `stairs`
- `electrical_panel`, `network_point`
- `risk_points`, `recommended_devices`

実装: `server/src/survey/ai-intake.ts` — 後から OpenAI Vision 等に差し替え可能な `provider` フィールド付き。

保存: `survey_ai_intakes` テーブル。

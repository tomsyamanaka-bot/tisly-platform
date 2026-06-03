# Phase 501–520 Status

**TiSLY Platform — AI Survey Intake, Drawing OCR & Workbox Sync Foundation**

## 完了項目

| # | 項目 | 状態 |
|---|------|------|
| 1 | Survey AI Intake API | ✅ mock `ai-intake.ts` |
| 2 | Drawing OCR placeholder | ✅ `drawing-ocr.ts` |
| 3 | 写真分類 (11種 + UI) | ✅ API PATCH + Survey PWA |
| 4 | Survey Workbox sync | ✅ localStorage + `/api/survey/sync` |
| 5 | Survey → PRO Floor Map | ✅ `generate-floor-map` |
| 6 | Floor Map UX | ✅ ズーム・ピンドラッグ・フロア名・SVG placeholder |
| 7 | AI見積候補 v2 | ✅ `createAiEstimatePlaceholder` 拡張 |
| 8 | Survey Report HTML | ✅ `/survey/:id/report` |
| 9 | Maintenance連携 | ✅ `POST /api/maintenance/from-survey/:id` |
| 10 | App Hub導線 | ✅ `workflows` on `/api/pwa/hub` |
| 11 | Docs | ✅ 本ディレクトリ 6 ファイル |
| 12 | Tests | ✅ 5 新規 test ファイル |

## 屋上について

`generateFloorMapFromSurvey` は `PRO_FLOOR_TIERS`（perimeter / 1f / 2f）のみ。屋上・3F は生成しない。

## Phase 521–540 提案

1. OpenAI Vision による AI Intake / OCR 本実装
2. Survey PDF レポート（Puppeteer）
3. Workbox + Background Sync 本番化
4. PRO Map SVG 枠線エディタ
5. 見積候補 → 正式見積ワークフロー連携
6. SSO / リフレッシュトークン（App Hub）

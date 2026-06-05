# Phase 1121–1160 Status — Field Deployment RC1 & Operations Automation

**完了日**: 2026-06-05  
**前提**: Phase 1041–1080 完了済み

## 概要

営業 → 現調 → 見積 → 施工 → 引渡し → 保守 を1ワークフローに統合。  
現調PWA強化 · AI現調解析 v4 · TOMS見積自動生成 · QR資産管理 · 保守PWA · 顧客ポータル v1 · 統合タイムライン · 案件司令塔 RC · Google TV camera focus 準備。

## 実装一覧

| Phase | 領域 | 主要ファイル |
|-------|------|-------------|
| 1121–1130 | 現調PWA強化 | `survey-field-media.ts`, `survey.ts`, `survey.html` |
| 1131–1135 | AI現調解析 v4 | `ai-survey-analysis-v4.ts`, `/api/ai/survey-analysis` |
| 1136–1140 | TOMS見積自動生成 | `estimateGenerateService.ts`, `/api/business/estimate/generate` |
| 1141–1145 | QR資産管理 | `asset-qr.ts`, `/api/assets/qr/*` |
| 1146–1150 | 保守PWA | `maintenance-schedule.ts`, `maintenance.html` |
| 1151–1153 | 顧客ポータル v1 | `customer-portal-field.ts`, `/customer-portal` |
| 1154–1156 | TiSLY Timeline | `tisly-timeline.ts`, `/api/timeline` |
| 1157–1158 | Dashboard RC | `project-dashboard-rc.ts`, `/project/:id` |
| 1159 | Google TV focus | `tv.ts` `POST /api/tv/focus-camera` |
| 1160 | ドキュメント | 本ファイル · `README.md` |

## API 一覧

| メソッド | パス | 認証 |
|----------|------|------|
| POST | `/api/survey/photo` | surveyor+ |
| POST | `/api/survey/audio` | surveyor+ |
| POST | `/api/survey/drawing` | surveyor+ (既存) |
| POST | `/api/survey/reverse-geocode` | surveyor+ |
| POST | `/api/ai/survey-analysis` | surveyor+ |
| POST | `/api/business/estimate/generate` | manager+ |
| POST | `/api/assets/qr/create` | installer+ |
| GET | `/api/assets/qr/history` | installer+ |
| GET | `/api/maintenance/schedule` | maintenance+ |
| POST | `/api/maintenance/report` | maintenance+ |
| GET | `/api/customer/:code/field-view` | owner |
| GET | `/api/timeline` | viewer+ |
| GET | `/api/toms/projects/:id/dashboard?rc=1` | なし |
| POST | `/api/tv/focus-camera` | なし |

## DB テーブル（新規）

| テーブル | 用途 |
|----------|------|
| `survey_audio_memos` | 音声メモ |
| `survey_sketch_memos` | 手書きメモ |
| `survey_analysis_v4` | AI現調解析結果 |
| `asset_qr_tokens` | QRトークン（設備紐付け） |
| `asset_qr_history` | QR発行・再発行履歴 |
| `maintenance_schedules` | 点検予定 |
| `maintenance_reports` | 完了報告 |

## UI ルート

| パス | 用途 |
|------|------|
| `/survey` | 現調PWA（GPS逆引き・音声・手書き・一括写真） |
| `/maintenance` | 保守PWA（点検予定・完了報告） |
| `/customer-portal` | 顧客ポータル v1 入口 |
| `/customer/:code` | 顧客ポータル（owner: 導入ビュー v1 タブ） |
| `/project/:id` | 案件司令塔 RC（カードUI） |

## テスト

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

- `server/test/phase1121-1160.test.ts`

## 次フェーズ候補 (1161–1200)

- Workbox 本番 Background Sync（現調・保守）
- AI Vision 実LLM接続（図面OCR）
- QNAP 施工完了自動アーカイブ
- Google TV アプリ側 camera focus 受信UI

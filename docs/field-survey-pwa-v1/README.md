# TiSLY 現調PWA v1

> **開発方針（2026-06）**: Phase 7（Lite 防犯ライン）は保留。**実務 PWA を最優先**。本ドキュメントの現調PWA v1 が最優先開発対象。

## 目的

現場でスマホのみで現調データを**作成・保存**し、後から**見積PWA**へ引き継げる状態にする。

- 保存・一覧・見積引き継ぎの入口を最優先（見た目より機能）
- 既存 `/survey`（デモ・AI 機能付き）とは分離し、実務用は `/survey-v1` を使用

## DB構成

既存 `survey_projects` を拡張し、子テーブルを追加。詳細は [db-design.md](./db-design.md)。

| テーブル | 役割 |
|----------|------|
| `survey_projects` | 案件本体（`workflow_status`, `customer_name`, `project_no` 等） |
| `survey_photos` | 写真・写真メモ（`comment`, `taken_at`） |
| `survey_project_notes` | フリーテキストメモ |
| `survey_materials` | 部材（8カテゴリ） |
| `survey_handoff_log` | 見積PWA への引き渡し監査 |

`workflow_status` 許容値: `surveying` → `estimate_pending` → `estimate_done` → `ordered` → `completed`

マイグレーション: `migration:field_survey_pwa_v1`（起動時自動）

## API一覧

ベース URL: `/api/survey/v1`  
認証: `requireAuth("surveyor")`（Bearer トークン）

| Method | Path | 説明 |
|--------|------|------|
| GET | `/projects` | 一覧（`?customerCode=` `?workflowStatus=`） |
| POST | `/projects` | 案件作成 |
| GET | `/projects/:id` | 詳細（写真・メモ・部材・handoff 含む） |
| PATCH | `/projects/:id` | 案件更新・`workflow_status` 変更 |
| POST | `/projects/:id/photos` | 写真メモ登録（`comment` 必須 or `imageBase64`） |
| POST | `/projects/:id/materials` | 部材追加 |
| POST | `/projects/:id/estimate-pending` | 見積待ちへ変更 + `survey_handoff_log` 記録 |

実装:

- ストア: `server/src/survey/survey-v1-store.ts`
- ルート: `server/src/api/routes/survey-v1.ts`
- 型: `server/src/survey/survey-v1-types.ts`

## PWA操作手順

| 項目 | パス |
|------|------|
| URL | `https://{host}/survey-v1` |
| HTML | `server/public/survey-v1.html` |
| JS | `server/public/js/survey-v1.js` |

### 手順

1. `surveyor` ロールでログイン（App Hub `/app` から遷移可）
2. **現調案件一覧** — テナント内の案件を表示
3. **＋ 新規現調案件** — 顧客名・住所・電話・メール・現調日・担当者・メモを入力して保存
4. **案件詳細** — 一覧からタップ
5. **写真メモ** — カメラ撮影 or テキストのみ登録
6. **部材** — カテゴリ・品名・数量を追加
7. **見積へ渡す** — `workflow_status` を `estimate_pending` に変更
8. **案件を編集** — 詳細画面から顧客情報・メモを PATCH 更新

App Hub `/app` に「現調 v1」カードあり。PWA マニフェスト: `manifest-survey-v1.webmanifest`

## 見積PWA v1 への連携

連携チェーン:

```text
survey_projects.project_id
  → business_projects.survey_project_id
  → business_estimates
```

- 「見積へ渡す」→ `workflow_status = estimate_pending` + `survey_handoff_log`
- 見積PWA v1（`/estimate-v1`）で案件取り込み → `business_project_id` 設定・部材シード
- 見積確定時 → `workflow_status = estimate_done`

詳細: [見積PWA v1 README](../field-estimate-pwa-v1/README.md)

## 次フェーズ作業

1. オフライン同期（Service Worker キュー）
2. 音声メモ（`survey_audio_memos`）
3. 部材・写真の編集/削除 UI

## テスト

```bash
cd server && npx tsx --test test/survey-v1.test.ts
```

確認項目: 案件作成・一覧・詳細・ステータス更新・写真メモ・部材・`estimate_pending`・handoff log・既存 `/api/survey` 非破壊

## 関連ドキュメント

- [DB 設計詳細](./db-design.md)
- [Phase 7 候補（保留）](../rc1-lite/phase7-candidates.md)

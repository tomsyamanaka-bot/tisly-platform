# 現在の状態（2026-06-09）

## コード状態

| 項目 | 値 |
|------|-----|
| 作業内容 | Google Calendar 本接続 / 現調メモ・写真タイトル / PDF レイアウト |
| ローカル build | 要確認 `npm run build` |
| 単体テスト | survey-v1 / estimate-v1 / practical-pwa-v2 |

## 完了（今回）

### A — Google Calendar 本接続

- `GOOGLE_CALENDAR_ENABLED` でモック/本番切替（既存モック維持）
- API: `GET /api/google-calendar/auth/start`, `GET /api/google-calendar/oauth/callback`, `POST /api/schedule/v1/sync/google`
- 日程調整右上 **Google同期** ボタン、未設定時は「Google連携は未設定です」
- 予定取得: 名前・開始/終了・場所・説明 + カテゴリ自動判定

### B — 現調メモ

- 保存先 `survey_project_notes.notes` に統一
- blur / Done / 600ms debounce / pagehide / visibilitychange
- 仕様書・完了報告書 PDF に現調メモ反映

### C — 写真タイトル

- `survey_photos.comment` をタイトルとして PATCH 保存
- PDF にタイトル反映（未入力は「写真1」形式）

### D — PDF レイアウト

- 上部余白削減、案件情報横並びコンパクト、写真タイトルは写真下中央
- 2列×4段（最大8枚/ページ）、見積・請求には写真なし

## URL（ローカル `npm start` / 本番）

| 画面 | URL |
|------|-----|
| App Hub | `/app` |
| 日程調整 | `/schedule-v1` |
| 現調 | `/survey-v1` |
| 見積・請求 | `/estimate-v1` |

ログイン: `TOMS001` / `toms001.surveyor` / `.env` の `CUSTOMER_DEMO_PASSWORD`

## 本番 VPS

→ [HUMAN_TODO.md](./HUMAN_TODO.md)（pull → build → restart が最優先）

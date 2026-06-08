# 現在の状態（2026-06-09）

## コード状態

| 項目 | 値 |
|------|-----|
| 作業内容 | 実務PWA 写真修正・見積TOMS・日程天気/配車 |
| ローカル build | ✅ `npm run build` 成功 |
| 単体テスト | ✅ schedule / survey / estimate / multi-pwa 計 47 PASS |

## 完了（今回）

### A — 最優先

- **A-1 現調写真** — `createImageBitmap` 廃止、HEIC/octet-stream 判定、console エラー、文言統一
- **A-2 番号** — 見積・請求とも `YYMMDD-001`（`generateTomsDailyDocNo`、旧データ維持）
- **A-3 登録番号** — 見積PDF/HTML/プレビューから削除（請求書は残す）
- **A-4 TOMS見積** — 会社情報・お見積書レイアウト・工事場所・写真あり/なしボタン

### B — 日程

- **B-1** — 週間カードから「現場不可」ボタン削除、詳細画面のみ
- **B-2** — 週間/3週間/月間すべてタップで `/api/schedule/v1/day` 詳細
- **B-3** — `weather-service.ts` 守谷市モック + Open-Meteo 差し替え準備
- **B-4** — `route-planner-service.ts` 配車表モック + Google Maps リンク

### C — 連携・検索

- **C-1** — 見積複数行（数量・単価・並べ替え・削除）
- **C-2** — 依頼主/現場分離（survey-v1）
- **C-3** — `search_index_json` 拡張（番号・宛名・現場・金額など）

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

# ブロッカー

## 🔴 本番デプロイ（人間必須）

| 項目 | 状態 | 対応 |
|------|------|------|
| VPS が旧コミット `d721f45` | 未解消 | SSH/VNC で pull → build → restart |
| Cursor から `tisly.jp:22` SSH | タイムアウト | 人間が自宅端末または ConoHa VNC から実行 |

## 🟡 外部 API（キー取得待ち）

| 項目 | 状態 | 備考 |
|------|------|------|
| Google Calendar OAuth | モック稼働 | `GOOGLE_CALENDAR_*` — [HUMAN_TODO.md](./HUMAN_TODO.md) |
| Google Maps Directions | モック所要時間 | `GOOGLE_MAPS_API_KEY` |
| Open-Meteo | モック（守谷市固定） | キー不要。`OPEN_METEO_LIVE=1` で本接続可 |
| Gmail SMTP 本番送信 | mock | `SMTP_*` |
| TOMS Excel/PDF 本番印影 | placeholder | 印影画像差し替え |

## 🟢 解消済み（ローカル）

- 現調写真 — iPhone Safari / HEIC 対応（FileReader + canvas）
- 見積番号 — `YYMMDD-001`（新規のみ）
- 見積PDF — 登録番号なし / TOMS レイアウト
- 日程 — 日付詳細・天気モック・配車表モック

## iPhone 実機未検証

ローカル・CI テストは PASS。本番反映後に Safari/PWA で写真・日程詳細を再確認すること。

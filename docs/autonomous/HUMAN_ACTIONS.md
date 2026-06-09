# 人間が後で設定する項目（HUMAN_ACTIONS）

Cursor 自走では **mock / disabled / ナビのみ** で進めます。本番連携には以下の手動設定が必要です。

---

## Google Calendar（日程調整 PWA）

| 項目 | 環境変数 | 手順 |
|------|----------|------|
| 本番モード有効化 | `GOOGLE_CALENDAR_ENABLED=true` | `server/.env` に設定 |
| OAuth クライアント ID | `GOOGLE_CLIENT_ID` または `GOOGLE_CALENDAR_CLIENT_ID` | [Google Cloud Console](https://console.cloud.google.com/) で作成 |
| OAuth クライアント Secret | `GOOGLE_CLIENT_SECRET` または `GOOGLE_CALENDAR_CLIENT_SECRET` | 同上 |
| リダイレクト URI | `GOOGLE_CALENDAR_REDIRECT_URI` | 本番: `https://tisly.jp/api/google-calendar/oauth/callback` を Console に登録 |
| 初回 OAuth | — | 日程調整画面で「Google同期」→ Google ログイン |

**未設定時の動作:** モック予定を表示（UI: `仮連携中`）

**設定後の確認:** UI バッジが `本番連携済み`、同期後に実カレンダー予定が表示される

---

## Google Maps（移動時間・ナビ）

| 項目 | 環境変数 | 手順 |
|------|----------|------|
| Directions API キー | `GOOGLE_MAPS_API_KEY` | Cloud Console で Directions API を有効化しキー発行 |
| 移動起点（任意） | `DISPATCH_DEFAULT_ORIGIN` | 未設定時は `事務所（守谷市）` |

**未設定時の動作:** ナビ URL 起動のみ、移動時間は目安（mock）、UI: `未設定` + 「Google Maps API未設定：ナビ起動のみ」

**設定後の確認:** 日程詳細の移動時間に `（API）` 表示、UI バッジが `本番連携済み`

---

## VPS 反映確認（毎回 push 後）

1. GitHub Actions **VPS Auto Deploy** が成功していること
2. https://tisly.jp/api/health を開く
3. `commitShort` が push した commit の先頭 7 文字と一致すること

---

## 関連ドキュメント

- [MANUAL_SETUP_REQUIRED.md](./MANUAL_SETUP_REQUIRED.md)
- [VPS_AUTO_DEPLOY.md](./VPS_AUTO_DEPLOY.md)
- [PROJECT_STATUS.md](./PROJECT_STATUS.md)

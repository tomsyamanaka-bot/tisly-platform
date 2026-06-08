# 人間が後で設定するもの

仮値・スタブで開発を進めている項目です。本番反映前に差し替えてください。

> 詳細版: [../manual-setup-required.md](../manual-setup-required.md)

## Gmail（メール送信）

| 項目 | 内容 |
|------|------|
| 取得先 | Google アカウント → セキュリティ → 2段階認証 → アプリパスワード |
| .env | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| 確認方法 | App Hub の「Gmail通知テスト」 |

仮値: `DUMMY_GMAIL_APP_PASSWORD`

## Web Push（VAPID）

| 項目 | 内容 |
|------|------|
| 取得先 | `cd server && npm run vapid:setup` |
| .env | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |

仮値: `DUMMY_VAPID_PUBLIC_KEY`, `DUMMY_VAPID_PRIVATE_KEY`

## Google Calendar

| 項目 | 内容 |
|------|------|
| 取得先 | Google Cloud Console → Credentials |
| .env | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |

仮値: `DUMMY_GOOGLE_CALENDAR_CLIENT_ID`

## TOMS 標準フォーマット連携

| 項目 | 内容 |
|------|------|
| 現状 | `/api/estimate/v1/projects/:id/toms-format` はスタブ JSON を返す |
| 本番前 | TOMS 仕様書に合わせて `buildTomsFormatPreviewV1` を本実装 |
| .env | API キー変数名は未確定（確定後ここに追記） |

## JWT / 管理者認証

| .env | 作業 |
|------|------|
| `JWT_SECRET` | `openssl rand -hex 32` で生成 |
| `ADMIN_PASSWORD_HASH` | 管理者パスワードをハッシュ化 |
| `CUSTOMER_DEMO_PASSWORD` | 本番では無効化または強力な値に変更 |

## VPS / QNAP デプロイ

| 項目 | 内容 |
|------|------|
| VPS | `scripts/deploy.sh` — SSH 鍵・DEPLOY_OPS_TOKEN |
| QNAP | イベントアーカイブ先パス — 環境ごとに確認 |

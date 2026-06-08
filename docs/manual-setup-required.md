# 人間が本番反映前に設定するもの

TiSLY Autonomous Development Mode で仮値・スタブで進めた項目の一覧です。

## Gmail（作業報告PWA・見積メール送信用）

| 項目 | 内容 |
|------|------|
| キー名 | Gmail アプリパスワード |
| 取得先 | Google アカウント → セキュリティ → 2段階認証 → アプリパスワード |
| .env 変数 | `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS` または `SMTP_PASSWORD`, `SMTP_FROM` |
| 本番前の作業 | 実際の Gmail アカウントでアプリパスワードを発行し `.env` に設定。テスト送信は App Hub の Gmail通知テストで確認 |

仮値例: `DUMMY_GMAIL_APP_PASSWORD`

## Web Push（VAPID）

| 項目 | 内容 |
|------|------|
| キー名 | VAPID 公開鍵・秘密鍵 |
| 取得先 | `cd server && npm run vapid:setup` または `docs/vapid_env_setup.md` |
| .env 変数 | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| 本番前の作業 | 本番ドメイン用に鍵を生成し `.env` に設定 |

仮値例: `DUMMY_VAPID_PUBLIC_KEY`, `DUMMY_VAPID_PRIVATE_KEY`

## Google Calendar（Business カレンダー連携）

| 項目 | 内容 |
|------|------|
| キー名 | OAuth クライアント ID / シークレット |
| 取得先 | Google Cloud Console → APIs & Services → Credentials |
| .env 変数 | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| 本番前の作業 | 本番 URL をリダイレクト URI に登録 |

仮値例: `DUMMY_GOOGLE_CALENDAR_CLIENT_ID`

## TOMS / AI 見積連携

| 項目 | 内容 |
|------|------|
| キー名 | TOMS AI 見積 API（将来） |
| 取得先 | TOMS 標準フォーマット仕様書・社内 API |
| .env 変数 | （未確定 — Phase B では `/api/estimate/v1/projects/:id/toms-format` スタブのみ） |
| 本番前の作業 | `estimateGenerateService` への本接続設計・API キー設定 |

## JWT / 管理者認証

| 項目 | 内容 |
|------|------|
| .env 変数 | `JWT_SECRET`, `ADMIN_PASSWORD_HASH` |
| 本番前の作業 | `openssl rand -hex 32` で JWT_SECRET を生成。管理者パスワードをハッシュ化して設定 |

## デモ用顧客パスワード

| 項目 | 内容 |
|------|------|
| .env 変数 | `CUSTOMER_DEMO_PASSWORD` |
| 本番前の作業 | デモ専用値を本番では無効化または強力なパスワードに変更 |

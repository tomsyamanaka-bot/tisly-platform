# Google OAuth 本番接続（Phase 581–600）

## 環境変数

- `GOOGLE_OAUTH_ENABLED=true`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI`

`GOOGLE_OAUTH_ENABLED=false` のときは従来どおり **mock**（接続済み扱い）。

## フロー

1. `GET /api/business/google/auth-url` で authorize URL
2. コールバック `POST /api/business/google/callback` で authorization code → refresh/access token を `platform_settings` に保存
3. `refreshGoogleAccessToken()` で access token 更新
4. Calendar / Gmail API 呼び出しは `integration_logs` に記録

## API

| Method | Path |
|--------|------|
| POST | `/api/business/google/calendar/create` |
| POST | `/api/business/google/gmail/draft` |
| POST | `/api/business/google/gmail/send`（placeholder） |

real 送信時は `/business/settings` の **real送信ガード** と `confirmed: true` が必要。

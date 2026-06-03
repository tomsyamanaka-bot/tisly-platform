# Google / Gmail OAuth（Business）

## サービス

`server/src/services/googleOAuthService.ts`

- `GOOGLE_OAUTH_ENABLED=false` のとき **mock**（接続済み扱い）
- `true` かつ Client ID/Secret/Redirect が揃うと **real**（refresh token 必須）

## API

| Method | Path |
|--------|------|
| GET | `/api/business/google/status` |
| GET | `/api/business/google/auth-url` |
| POST | `/api/business/google/callback` |
| POST | `/api/business/google/test` |

refresh token は `platform_settings.google_oauth_refresh_token` に保存（mock callback も同様）。

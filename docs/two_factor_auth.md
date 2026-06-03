# Two-Factor Authentication (TOTP) — Phase 181-200

管理者アカウント向け **2FA 準備** です。現時点は **モック実装**（Phase 201+ で otplib 等に差し替え）。

## API

| メソッド | パス | 説明 |
|----------|------|------|
| POST | `/api/auth/2fa/setup` | TOTP secret 発行（要 admin JWT） |
| POST | `/api/auth/2fa/verify` | コード検証 + 有効化 `{ code }` |
| POST | `/api/auth/2fa/disable` | 2FA 無効化 |

## モック動作

- セットアップで `otpauth://` URL と secret を返却
- 検証コード **`000000`** を常に受理（PoC 用）
- 本番前に real TOTP ライブラリへ置換必須

## テーブル

`totp_secrets` — `user_id`, `secret`, `enabled`, `verified_at`

## 本番チェックリスト

- [ ] otplib / speakeasy 導入
- [ ] ログイン時 2FA 必須フロー
- [ ] リカバリーコード
- [ ] Operations UI に 2FA 設定画面

## 実装

- `server/src/auth/totp.ts`

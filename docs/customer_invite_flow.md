# 顧客ユーザー招待フロー（Phase 261–280）

## 概要

`customer_users` に招待状態を追加し、owner/admin がポータルからユーザーを招待・ロール変更・停止できます。

## DB 項目

| 列 | 説明 |
|----|------|
| `invite_token` | 招待トークン（受諾まで） |
| `invite_expires_at` | 有効期限（既定 72h） |
| `invited_by` | 招待者 user id |
| `invited_at` | 招待日時 |
| `accepted_at` | 受諾日時 |
| `disabled_at` | 停止日時 |

`status`: `active` | `invited` | `suspended` | `deleted`

## API

| メソッド | パス | 権限 |
|----------|------|------|
| GET | `/api/customer/:code/users` | viewer+ |
| POST | `/api/customer/:code/users/invite` | owner/admin |
| POST | `/api/customer/:code/users/accept-invite` | 公開（トークン+パスワード） |
| POST | `/api/customer/:code/users/:id/disable` | owner/admin |
| POST | `/api/customer/:code/users/:id/role` | owner/admin |

## フロー

1. admin が `invite` → `status=invited`、トークン発行
2. 被招待者が `accept-invite` でパスワード設定 → `status=active`
3. admin が `disable` → `status=suspended`、`disabled_at` 設定 → ログイン不可

## テナント分離

JWT `customerId` と `requireTenantMatch` により他顧客のユーザー操作は 403。

## テスト

`server/test/customer-invite.test.ts`

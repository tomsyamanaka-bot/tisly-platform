# 顧客ユーザーロール（Phase 241–260）

## ロール一覧

| ロール | 権限 |
|--------|------|
| **owner** | 全権限（ユーザー管理・設定・ポータル・TV） |
| **admin** | 設定変更（プラン・ブランディング・status） |
| **manager** | 運用確認（ユーザー一覧・監査ログ・設備） |
| **viewer** | 閲覧のみ（ダッシュボード・イベント・TV） |

`super_admin` はレガシー互換で **owner** と同ランク。

## デモアカウント

| 顧客 | ユーザー例 | パスワード |
|------|------------|------------|
| TOMS001 | `toms001.owner` / `.admin` / `.manager` / `.viewer` | `CUSTOMER_DEMO_PASSWORD` |
| HOTEL001 | `hotel001.*` | 同上 |
| PLANT001 | `plant001.*` | 同上 |

## API との対応

- 設定変更 `PATCH /api/customers/:code` → **admin** 以上（`canChangeCustomerSettings`）
- 監査・ユーザー一覧 → **manager** 以上
- ポータル・TV → **viewer** 以上 + プラン制限

## DB

`customer_users.role` CHECK: `owner`, `admin`, `manager`, `viewer`, `super_admin`

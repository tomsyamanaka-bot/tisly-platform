# PRO Remote 顧客運用ガイド（Phase 241–260）

## 日常運用

1. **Operations** `/operations#infrastructure` — 顧客数・TV オンライン・テナント分離状態
2. **顧客ポータル** `/customer/TOMS001` — 現場・設備・警報・AI サマリー
3. **TV** `/tv/TOMS001` — 15 秒更新、警報時 10 秒全画面
4. **顧客管理** `/admin/TOMS001` — プラン・ブランディング・監査

## 認証

- `POST /api/auth/customer/login` — ロックアウト・監査ログ・`last_login_at`
- 失敗回数: `CUSTOMER_LOGIN_MAX_ATTEMPTS` / `CUSTOMER_LOGIN_LOCK_MINUTES`

## テナント分離

- `server/src/auth/tenant-guard.ts`
- 顧客 JWT は自社 `customer_id` のみ
- プラットフォーム admin は全顧客（運用）

## 営業レポート

- `GET /api/customer/TOMS001/sales-report`（PRO_REMOTE）
- `/sales` は従来のプラットフォーム営業モード（維持）

## VPS 投入前チェック

- [ ] ワイルドカード SSL / サブドメイン nginx
- [ ] `JWT_SECRET` / デモパスワード変更
- [ ] `TV_CERT_FINGERPRINT` 本番値
- [ ] PostgreSQL / Redis（本番）
- [ ] プランと契約の一致確認

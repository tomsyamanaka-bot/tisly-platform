# Customer Wizard（顧客登録ウィザード）

Phase 1001–1040 — First Customer Deployment Kit

## URL

- UI: `/customer/new`
- API: `POST /api/deployment-kit/customers/wizard`（管理者認証）

## 入力項目

| 項目 | 必須 |
|------|------|
| 顧客名 | ✓ |
| 現場名 | ✓ |
| 住所 | |
| 担当者 | |
| 電話番号 | |
| メール | |

## 完了後

- `customerCode` 自動生成（例: `TOMS001`, `TOMS002`）
- オーナーユーザー + 初期パスワード発行
- 導入チェックリスト行を自動作成

## 関連

- 次コード確認: `GET /api/deployment-kit/customers/next-code`
- 現場作成: `/site/new?customer=TOMS003`

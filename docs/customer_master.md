# Customer Master (Phase 621–660)

## URL

`/customer-master`

## API

| 操作 | メソッド |
|------|----------|
| 一覧 | `GET /api/toms/customer-master` |
| 詳細 | `GET /api/toms/customer-master/:id` |
| 新規 | `POST /api/toms/customer-master` |

## 項目

名前、会社、住所、電話、メール、現場一覧、施工・請求・入金・保守履歴（Business 案件から集約）。

Business 顧客は初回アクセス時に `toms_customer_master` へ自動同期されます。

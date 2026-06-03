# 入金→ステータス自動遷移

`createBusinessPayment` 登録後に `applyPaymentStatusAfterRecord` を実行。

| 条件 | ステータス |
|------|------------|
| 入金合計 = 0 | `invoice_sent` |
| 0 < 入金合計 < 請求額 | `partial_paid` |
| 入金合計 ≥ 請求額 | `paid`（paidDate 設定） |
| 既に `closed` | 変更なし |

履歴: `business_integration_logs`（provider: `payment_auto`）

手動クローズ: 既存 `POST .../paid` / `close` ワークフロー。

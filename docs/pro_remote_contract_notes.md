# PRO Remote 契約メモ（placeholder）

Phase 261–280 では UI に契約プレースホルダを表示します。本番請求連携は Phase 281+ を想定。

## 表示箇所

- 顧客ポータル: ダッシュボード「契約・プラン」カード
- 管理 UI `/admin/:code`: プラン・有効機能・contractNote

## フィールド

| 項目 | ソース |
|------|--------|
| plan | `customers.plan` |
| status | `customers.status` |
| enabledFeatures | `plan-guard.ts` `listPlanFeatures()` |
| contractNote | 固定 placeholder（営業連携 TODO） |

## デモ顧客

| コード | プラン |
|--------|--------|
| TOMS001 | PRO_REMOTE |
| HOTEL001 | PRO |
| PLANT001 | Standard |

PRO_REMOTE のみ: ポータル、TV、営業レポート、Webhook、QNAP アーカイブ、SOC/NOC 連携設計。

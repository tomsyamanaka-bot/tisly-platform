# TOMS Operating System (Phase 621–660)

## 統合コンセプト

Survey / Installer / Maintenance / Business / PRO Remote / App Hub を **案件中心** で接続。

```
案件作成 → 現調 → 図面 → AI見積 → 見積送付 → 施工 → 完了報告 → 請求 → 入金 → 保守 → PRO運用
```

## モジュール (`server/src/toms/`)

| モジュール | 役割 |
|-----------|------|
| project-timeline | 時系列イベント |
| workflow-engine | TOMS状態遷移 |
| project-dashboard | 案件集約API |
| unified-search | 全体検索 |
| customer-master | 顧客台帳 |
| asset-master / qr-management | 設備・QR |
| construction-photos | 写真自動分類 |
| drawing-versions | 現調/施工/完成図 |
| ai-estimate-v3 | AI見積 |
| toms-kpi | KPI |
| toms-push / hub-operations | Push・App Hub |

## API プレフィックス

`/api/toms`

## App Hub

`GET /api/pwa/hub` の `operations` に今日の現調・工事、未請求・未入金、保守期限、ESP/Shelly異常を含む。

# Schedule Planner v1 — 日程調整 PWA

## 目的

Googleカレンダーよりも、工事屋が予定を見やすく、空き日をすぐ答えられる画面。

## URL

- PWA: `/schedule-v1`
- API: `/api/schedule/v1/*`

## 表示モード

| モード | 説明 |
|--------|------|
| 週間 | 各日をカード表示。空き度・予定件数・現場不可ラベル |
| 3週間 | 縦スクロールで週ブロック（工事件数サマリー） |
| 月間 | 日付セルにカテゴリ色付き表示。タップで詳細 |

## 空き度

| 予定件数 | 表示 |
|----------|------|
| 0件 | ★★★★★ |
| 1〜2件 | ★★★★☆ |
| 3〜4件 | ★★☆☆☆ |
| 5件以上 | 満車 |

現場不可日は空き度より優先して薄赤カード＋赤ラベル。

## カテゴリ

| カテゴリ | 色 | 文言 |
|----------|-----|------|
| construction | 🟫 茶 | 工事 |
| office | 🟦 青 | 事務 |
| family | 🟩 緑 | 家族 |
| urgent | 🟥 赤 | 重要 |

## API

```
GET  /api/schedule/v1/week?offset=0
GET  /api/schedule/v1/three-weeks?offset=0
GET  /api/schedule/v1/month?year=2026&month=6
GET  /api/schedule/v1/summary?range=week&offset=0
POST /api/schedule/v1/unavailable
PATCH /api/schedule/v1/unavailable/:id
DELETE /api/schedule/v1/unavailable/:id
```

## 将来連携

```
日程調整 → 現調 → 見積 → 施工 → 請求
         ↓
Google Calendar API / Notion / 顧客管理 / 作業報告 / 在庫
```

現時点は `server/src/services/googleCalendar.ts` のモックデータ。
OAuth・APIキーは [autonomous/HUMAN_TODO.md](./autonomous/HUMAN_TODO.md) 参照。

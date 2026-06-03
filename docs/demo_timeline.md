# Demo Timeline（Phase 821–860）

## 概要

過去 **30日分** の運用履歴を `events` / `business_project_timeline` / `device_timeline` に生成します。

## イベント種別

| 種別 | 用途 |
|------|------|
| intrusion | 侵入 |
| maintenance | 保守 |
| estimate / invoice / payment | 見積・請求・入金 |
| shelly_restart | Shelly 再起動 |
| esp_recovery | ESP 復旧 |

## 営業での見せ方

- TOMS 案件タイムライン（`BIZ-DEMO-*`）
- 運用イベント一覧 `/api/events`
- デモ再生 `/api/demo/replay`

## API

- リセット時に再生成: `POST /api/demo-kit/reset`
- 状態: `GET /api/demo-kit/status` → `timelineSeeded`

## 実装

- `server/src/demo-kit/demo-timeline-generator.ts`

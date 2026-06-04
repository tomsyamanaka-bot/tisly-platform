# PRO Remote Live Pins（Phase 906）

## API

`GET /api/demo-kit/floor-preview-live/:customerCode`

従来の `floor-preview` に加え、DB / adapter からデバイス状態をマージしピン色を更新します。

## 色

| 状態 | 色 |
|------|-----|
| ONLINE | 緑 `#22c55e` |
| WARNING | 黄 `#f59e0b` |
| OFFLINE | 赤 `#ef4444` |

## 営業 UI

`/sales/floor-preview` — 15 秒ごとにライブ API をポーリング。

## 実装

`server/src/demo-kit/demo-pro-remote-live.ts`

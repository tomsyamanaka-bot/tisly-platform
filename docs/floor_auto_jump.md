# Floor Auto Jump（Phase 701–740）

## 動作

1. Floor Stack（外周 / 1F / 2F）縦スクロール UI
2. `critical` / `warning`（設備 OFFLINE・WS `floor_alert`）で該当階へ `scrollIntoView`
3. 異常ピンは **10秒間** `pin-blink` アニメーション
4. ユーザーが Floor Stack を操作（wheel / touch / click）すると **45秒** 自動ジャンプ一時停止

## 実装

- `server/public/js/project-dashboard.js` — `jumpToFloorTier`, `isAutoJumpPaused`
- `server/src/toms/floor-stack-project.ts` — `firstAnomalyTier`, `scrollTarget`

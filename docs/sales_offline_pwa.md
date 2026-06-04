# /sales オフライン PWA（Phase947）

## Service Worker

- ファイル: `server/public/service-worker.js`（v941）
- キャッシュ: `/sales`, `/sales/floor-preview`, `/devices`, `/tv/*`, 関連 JS/CSS

## オフライン時

バナー表示: **デモ表示は可能・実データ更新停止**

- `navigator.onLine === false` で Live バッジを Offline
- `/api/*` は SW がパススルー（キャッシュしない）

## 登録

`/sales` 読み込み時に `navigator.serviceWorker.register("/service-worker.js")`

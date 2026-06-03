# PWA キャッシュ戦略（Phase 701）

## Service Worker

- ファイル: `server/public/service-worker.js`
- バージョン: `tisly-pwa-v701`

## キャッシュ階層

| キャッシュ名 | 用途 |
|------------|------|
| `tisly-pwa-priority-v701` | App Hub・offline-fallback（今日のタスク入口） |
| `tisly-pwa-shell-v701` | App Hub / Business KPI / 司令塔 / Survey / 保守 / PRO Remote シェル |

## 優先リソース

- `/app-hub.html` — 今日のタスク
- `/project-dashboard.html` — 司令塔（オフライン案件）
- `/business-kpi.html`, `/customer-master.html`
- 各 PWA の JS/CSS/manifest

## API

`/api/*` はキャッシュしない（常にネットワーク）。

## Background Sync

`tisly-installer-sync` — 未送信キュー flush（既存 Phase 481 継承）。

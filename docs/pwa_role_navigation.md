# PWA ロール別ナビゲーション（Phase 461–480）

## App Hub

ログイン後 `GET /api/pwa/hub` が返す `apps` 配列が、ユーザーに表示する PWA カードです。

- 入口: `/app`
- 403 チェック: `GET /api/pwa/access/:pwaId`

## ロールマトリクス

| PWA ID | installer | surveyor | maintenance | viewer | admin |
|--------|-----------|----------|-------------|--------|-------|
| installer（施工） | ✓ | — | ✓ | — | ✓ |
| survey（現調） | — | ✓ | — | — | ✓ |
| pro_remote | — | — | — | ✓ | ✓ |
| maintenance | — | — | ✓ | — | ✓ |
| customer_portal | — | — | — | ✓ | ✓ |
| admin | — | — | — | — | ✓ |

## デモユーザー（TOMS001）

| ユーザー名 | ロール |
|------------|--------|
| toms001.installer | installer |
| toms001.surveyor | surveyor |
| toms001.maintenance | maintenance |
| toms001.viewer | viewer |
| toms001.admin | admin |

## PWA 切替 UI

各 PWA ページ上部の「アプリ切替」から Hub API に基づくリンク一覧を表示します。

実装: `server/public/js/tisly-pwa-shell.js`

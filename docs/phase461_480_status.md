# Phase 461–480 ステータス — Multi PWA App Hub

## 完了

| 項目 | 状態 |
|------|------|
| App Hub `/app` | ログイン + ロール別カード |
| Role Based Navigation | `server/src/pwa/pwa-hub.ts` |
| Survey PWA 強化 | 案件・写真各種・メモ・AI/見積 placeholder |
| Maintenance PWA | `/maintenance` 新規 |
| PRO Remote manifest | 静的 + `/customer/:code/pro-remote/manifest.webmanifest` |
| Customer Portal manifest | 静的 + `/customer/:code/manifest.webmanifest` |
| 共通 App Shell | `tisly-pwa-shell.js` / `.css` |
| PWA 切替 UI | 画面上部アプリ切替 |
| iPhone / Android meta | 各 PWA HTML |
| テスト | `multi-pwa-app-hub.test.ts` |
| Service Worker | `tisly-pwa-v461` |

## ロール別表示

| ロール | 表示 PWA |
|--------|----------|
| installer | 施工のみ |
| surveyor | 現調のみ |
| maintenance | 保守 + 施工（履歴） |
| viewer | PRO Remote + 顧客ポータル |
| manager | 施工・現調・監視・保守・顧客（管理除く） |
| admin / owner | 全6種 |

## 次 Phase（481–500）候補

- Survey 本番 API + 写真アップロード
- Maintenance Shelly 再起動 API
- Workbox 導入・PWA 別 scope SW
- Background Sync 本番化
- App Hub SSO / リフレッシュトークン

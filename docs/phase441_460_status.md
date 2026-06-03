# Phase 441–460 ステータス — Installer Only PWA & Survey Placeholder

## 完了

- Installer PWA App Shell（manifest, SW v441, icons, offline fallback, install guide）
- iPhone meta + `docs/ios_pwa_install_guide.md`
- Android beforeinstallprompt + `docs/android_pwa_install_guide.md`
- 施工員ホーム `/customer/:code/install/home`
- installer ロール API 制限（users, billing, plan, settings, webhooks, notification-rules）
- Survey placeholder `/survey`
- `docs/tisly_pwa_strategy.md`
- `server/test/pwa-installer.test.ts`

## 次 Phase 候補（461–480）

- JWT refresh / silent renew
- Background Sync 本番 flush（SW → API 自動）
- Survey PWA 本実装
- PRO Remote 専用 manifest scope 分離
- Workbox 導入検討

# TiSLY PWA 戦略（Phase 461–480 更新）

施工員・現調・PRO Remote・メンテナンス・顧客ポータルを PWA 化し、**App Hub**（`/app`）でロール別に入口を統合する。

## PWA 一覧

| PWA | URL 例 | 対象ロール | 状態 |
|-----|--------|------------|------|
| **Installer** | `/customer/:code/install/home` | installer, maintenance, admin | 本実装 |
| **Survey** | `/survey` | surveyor, admin | Phase 461–480 強化 |
| **PRO Remote** | `/customer/:code/pro-remote` | viewer, admin | manifest 分離 |
| **Maintenance** | `/maintenance` | maintenance, admin | 新規 |
| **Customer Portal** | `/customer/:code` | viewer+, admin | manifest 追加 |
| **App Hub** | `/app` | 全員（ログイン後） | 新規 |
| **TV** | `/tv/:code` | 店舗 | **PWA 外** — `tv-app/` |

## 共通 App Shell

- `js/tisly-pwa-shell.js` — オフライン表示・インストール・更新通知・同期ステータス・アプリ切替
- `service-worker.js` — `tisly-pwa-v461`
- `/offline` — オフラインフォールバック
- `/install-guide` — iOS / Android 手順

## ロールナビゲーション

`docs/pwa_role_navigation.md` を参照。

## 関連ドキュメント

- `docs/installer_pwa.md`
- `docs/tisly_survey_pwa.md`
- `docs/maintenance_pwa.md`
- `docs/pro_remote_pwa.md`
- `docs/customer_portal_pwa.md`
- `docs/ios_pwa_install_guide.md`
- `docs/android_pwa_install_guide.md`
- `docs/phase461_480_status.md`

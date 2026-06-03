# TiSLY PWA 戦略（Phase 441–460）

施工員・現調・PRO Remote・メンテナンス・顧客ポータルを PWA 化し、App Store / Google Play なしで URL + ホーム画面追加で配布する。

## PWA 化する画面

| PWA | URL 例 | 対象ユーザー | 状態 |
|-----|--------|--------------|------|
| **Installer PWA** | `/customer/:code/install` · `/install/home` | 施工員のみ | Phase 441–460 本実装 |
| **Survey PWA** | `/survey` | 現調担当 | placeholder |
| **PRO Remote PWA** | `/operations` · 顧客ポータル | オペレーター | 既存 + manifest 共用 |
| **Maintenance PWA** | （今後） | メンテ担当 | 未着手 |
| **Customer Portal PWA** | `/customer/:code` | 顧客管理者 | 既存 HTML |
| **TV** | `/tv/:code` | 店舗ディスプレイ | **PWA ではなく Google TV 専用アプリ**（`tv-app/`） |

## Installer PWA の設計原則

- 一般顧客向けアプリではない。installer ロール専用。
- iPhone Safari / Android Chrome 両対応。
- `manifest.webmanifest`（顧客別動的 manifest）+ `service-worker.js` でシェルオフライン。
- 請求・ユーザー管理・プラン変更は API ガードで拒否（`installer-restricted-guard.ts`）。

## 技術スタック

- 素の HTML/CSS/JS（Workbox は未導入、Phase 461+ で検討可）
- オフラインキュー: localStorage + `POST .../install/sync`
- Background Sync: SW タグ `tisly-installer-sync`（クライアント flush 連携）

## 関連ドキュメント

- `docs/ios_pwa_install_guide.md`
- `docs/android_pwa_install_guide.md`
- `docs/tisly_survey_pwa.md`
- `docs/offline_installer_pwa.md`

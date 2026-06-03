# Installer PWA（施工）

## URL

| 画面 | パス |
|------|------|
| 施工モード | `/customer/:code/install` |
| 施工ホーム | `/customer/:code/install/home` |
| インストール手順 | `/customer/:code/install/guide` |
| Manifest | `/customer/:code/install/manifest.webmanifest` |

## App Hub

installer ロールは App Hub で **施工** カードのみ表示されます。

## 権限

- API: `requireAuth("installer")` 以上
- 請求・ユーザー管理は `installer-restricted-guard` で 403

## 関連

- Phase 441–460: `docs/phase441_460_status.md`
- オフライン: `docs/offline_installer_pwa.md`（存在する場合）

# Phase 2041–2080 ステータス — PWA アイコン本番確認

## 目的

iPhone Safari で PWA 追加時に旧アイコンが出る問題の本番反映確認と、確実な再追加手順の整備。

## 実装

| 項目 | 状態 |
|------|------|
| `APP_ICON_VERSION` 定数（`pwa-manifest-icons.ts`） | 完了 |
| `GET /api/deploy/pwa-icon-check` | 完了 |
| `/deployment/checklist` PWAアイコン本番確認 UI | 完了 |
| iPhone 再追加手順（画面内） | 完了 |
| `docs/vps_phase2041_launch.md` | 完了 |
| `phase2041-2080.test.ts` | 完了 |

## 確認 URL

- https://tisly.jp/icons/icon-192.png?v=2001
- https://tisly.jp/icons/icon-512.png?v=2001
- https://tisly.jp/apple-touch-icon.png
- https://tisly.jp/manifest.webmanifest?v=2001
- https://tisly.jp/api/deploy/pwa-icon-check
- https://tisly.jp/deployment/checklist

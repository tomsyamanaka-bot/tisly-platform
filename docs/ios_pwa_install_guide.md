# iPhone（Safari）— Installer PWA インストール手順

## 前提

- iOS 16.4 以降推奨（Web Push は別途 Phase で本番化）
- 施工員アカウントでログイン済みであること
- URL 例: `https://tisly.jp/customer/TOMS001/install/home`

## 手順

1. **Safari** で施工 URL を開く（Chrome iOS は Add to Home Screen の挙動が異なる場合あり）
2. 共有ボタン **□↑** をタップ
3. **ホーム画面に追加** を選択
4. 名前を「TiSLY施工」などにして **追加**
5. ホーム画面のアイコンから起動 → ステータスバーは `black-translucent`（`installer-mode.html` / `installer-home.html` の meta）

## HTML で設定している meta

| meta / link | 値 |
|-------------|-----|
| `apple-mobile-web-app-capable` | yes |
| `apple-mobile-web-app-title` | TiSLY施工 |
| `apple-mobile-web-app-status-bar-style` | black-translucent |
| `apple-touch-icon` | `/icons/icon-192.png` |
| viewport | `viewport-fit=cover`（ノッチ対応） |

## オフライン

- Service Worker がシェル（施工 HTML/CSS/JS）をキャッシュ
- API はオンライン時のみ。オフライン時はキューに保存し、復帰後に **同期** ボタン

## トラブルシュート

| 症状 | 対処 |
|------|------|
| アイコンが汎用のまま | `icon-192.png` が配信されているか確認 |
| ログインが切れる | JWT 期限 — 再ログイン（refresh は Phase 461+） |
| カメラ（QR）が動かない | Safari のサイト設定でカメラ許可 |

# Android（Chrome）— Installer PWA インストール手順

## 前提

- Chrome 最新版推奨
- HTTPS 必須（localhost は開発例外）
- manifest + service worker が有効であること

## 手順

1. Chrome で `https://…/customer/TOMS001/install/home` を開く
2. ログイン（施工員アカウント）
3. 次のいずれかでインストール:
   - 画面下部の **アプリをインストール** バナー
   - メニュー ⋮ → **アプリをインストール** / **ホーム画面に追加**
   - 施工画面の **ホーム画面に追加** ボタン（`beforeinstallprompt` 捕捉時のみ表示）

## 実装（`installer-pwa.js`）

- `beforeinstallprompt` で `deferredInstallPrompt` を保持
- `#btn-pwa-install` / `#btn-android-install` から `prompt()` 呼び出し
- `display-mode: standalone` または `navigator.standalone` でスタンドアロン判定 → インストール UI を非表示

## QR スキャン権限

- `html5-qrcode` 利用時、Chrome は **カメラ** 権限を要求
- 初回は許可ダイアログを表示 — 拒否時は JSON 手入力で claim 可能（施工 PWA の QR パネル）

## オフライン同期

- オフライン中: 画面上部に「オフライン中」「未同期: N」
- オンライン復帰後: **同期** → `POST /api/customer/:code/install/sync`

## トラブルシュート

| 症状 | 対処 |
|------|------|
| インストールボタンが出ない | 既にインストール済み、または manifest の `start_url` / `scope` を確認 |
| SW が更新されない | アプリ情報 → ストレージ削除、または SW バージョン `tisly-installer-v441` 確認 |

# PWA 戦略（スマホ）

> **Phase 21–40** — tisly.jp 上の PWA

## 原則

- **スマホ = PWA のみ**（ストア配布なし）
- 通知 = **Web Push**（VAPID）
- データ = tisly.jp REST API

## 登録フロー

1. ユーザー登録（将来: 認証 API）
2. ブラウザで `https://tisly.jp/` を開く
3. 「ホーム画面に追加」
4. ダッシュボードで **Push 登録** → `Notification.requestPermission()`
5. `POST /api/notifications/subscribe` で subscription 保存
6. イベント発生時に `notification-service` が Web Push 送信

## ファイル

| パス | 役割 |
|------|------|
| `server/public/manifest.json` | PWA マニフェスト |
| `server/public/sw.js` | Service Worker |
| `server/public/js/push.js` | 登録・テスト |

## 管理

- Platform Settings → PWA / Push
- 通知テストボタン（ダッシュボード・設定画面）

## オフライン

本フェーズではオフラインキャッシュは最小限。Phase 41+ で Workbox 検討。

## TV との役割分担

| | スマホ PWA | Google TV |
|--|-----------|-------------|
| 用途 | 外出先・プッシュ受信 | 常設監視 |
| 技術 | HTML + SW | React Native |

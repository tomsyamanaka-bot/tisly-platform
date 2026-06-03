# Installer PWA（施工モード）

## URL

`/customer/TOMS001/install`（PRO_REMOTE 顧客）

## 画面タブ

| タブ | 内容 |
|------|------|
| 現場 | 現場選択・作成 |
| フロア | フロア選択・図面 upload・QNAP archive |
| 登録 | デバイスウィザード |
| QR | QR 発行 / JSON claim |
| NFC | UID 入力 claim（placeholder） |
| 通信 | heartbeat / event / relay / notification テスト |
| 配置 | Map Editor リンク・配置状況 |
| MQTT | ブローカー診断 |
| 完了 | チェックリスト・レポート・ラベル |

## 認証

顧客 JWT（`tisly_admin_token`）。推奨ロール: **installer** 以上。

## PWA

`manifest.webmanifest` + `service-worker.js` を登録（キャッシュは既存 SW に依存）。

## オフライン

`localStorage` キュー placeholder — 詳細は `docs/offline_installer_pwa.md`。

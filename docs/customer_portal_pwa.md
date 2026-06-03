# Customer Portal PWA

## URL

- `/customer/:code`
- 概要ショートカット: `/customer/:code/overview`

## Manifest

- 静的: `/manifest-customer.webmanifest`
- 動的: `/customer/:code/manifest.webmanifest`

## PWA メタ

`customer-portal.html` に `apple-touch-icon` · `mobile-web-app-capable` · `theme-color` を設定。

## 対象ロール

全ロールがポータルにアクセス可能。App Hub カードは `viewer` 以上で表示。

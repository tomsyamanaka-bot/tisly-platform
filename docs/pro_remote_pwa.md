# PRO Remote PWA

## URL

| 画面 | パス |
|------|------|
| PRO Remote 入口 | `/customer/:code/pro-remote` |
| 概要 | `/customer/:code/overview` |
| Health | `/customer/:code/health` |
| フル運用 | `/operations` |

## Manifest

- 静的テンプレ: `/manifest-pro-remote.webmanifest`
- 顧客別: `/customer/:code/pro-remote/manifest.webmanifest`

## 対象ロール

`viewer` · `manager` · `admin` · `owner`

Google TV（`/tv/:code`）は PWA ではなく TV 専用アプリ方針を維持します。

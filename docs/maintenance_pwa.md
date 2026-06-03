# Maintenance PWA

## URL

- `/maintenance`
- Manifest: `/manifest-maintenance.webmanifest`

## 機能

- 顧客・現場選択
- Device 状態一覧（API: `/api/customer/:code/devices`）
- Heartbeat / タイムライン
- MQTT 接続表示（オンライン状態）
- 通知・イベント履歴
- Recovery 概要
- Shelly 再起動（placeholder）
- 保守メモ（localStorage）
- 施工履歴リンク → `/customer/:code/install/home`

## 対象ロール

`maintenance` · `manager` · `admin` · `owner`

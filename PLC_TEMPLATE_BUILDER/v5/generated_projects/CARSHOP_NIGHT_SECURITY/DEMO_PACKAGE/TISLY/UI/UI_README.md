# TiSLY UI Dashboard — CARSHOP_NIGHT_SECURITY

**TiSLY PLC Builder v5.16 — TiSLY UI Dashboard Template**

## 概要

案件 `CARSHOP_NIGHT_SECURITY` 向け PWA ダッシュボードです。  
MQTT 状態（警報 / 動体 / 接点 / 出力）をリアルタイム表示します。

## ファイル構成

| ファイル | 説明 |
|----------|------|
| index.html | メインダッシュボード |
| app.js | MQTT / UI ロジック |
| styles.css | TiSLY ダークテーマ（Google TV 対応） |
| manifest.webmanifest | PWA マニフェスト |
| sw.js | Service Worker（オフラインキャッシュ） |
| UI_CONFIG.json | ブローカー / トピック / デバイス定義 |

## デプロイ

1. `TISLY/UI/` フォルダを Web サーバーまたは Node-RED `http static` に配置
2. `UI_CONFIG.json` の `mqtt.broker` / `ws_port` を現地環境に合わせて編集
3. ブラウザで `index.html` を開く（PWA としてホーム画面追加可能）
4. Google TV / Chromecast では Chrome で同 URL を全画面表示

## MQTT トピック

| 種別 | トピック |
|------|----------|
| 状態 | `tisly/device/211/state` |
| 警報 | `tisly/device/211/alarm` |
| 動体 | `tisly/device/211/motion` |
| 出力 | `tisly/device/211/output` |
| コマンド | `tisly/device/211/cmd` |

## Node-RED 連携

`TISLY_FLOWS.json` を Node-RED にインポート後、本 UI と同一ブローカー `mqtt.tisly.local` を使用してください。

---

*TiSLY PLC Builder v5.16 — TiSLY UI Dashboard Template*

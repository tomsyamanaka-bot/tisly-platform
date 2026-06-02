# TiSLY Google TV App

Phase 21–40 基盤。スマホは PWA、Google TV のみ本ネイティブアプリ。

## 画面

| 画面 | 説明 |
|------|------|
| Home | TV ダッシュボード（時刻・状態・カードナビ） |
| Security | 警報・監視 |
| Events | イベント一覧（tisly.jp API） |
| Cameras | RTSP/WebRTC プレースホルダー |
| Status | デバイス・システム状態 |
| Settings | TV 設定 |

## 開発

```bash
cd tv-app
npm install
npx expo start
```

Android TV: `npx expo run:android`（Leanback ランチャーは `app.json` intentFilters）

## 環境変数

| 変数 | 既定 |
|------|------|
| `EXPO_PUBLIC_API_URL` | `https://tisly.jp` |
| `EXPO_PUBLIC_MQTT_WS` | `wss://mqtt.tisly.jp:9001` |

詳細: [docs/google_tv_app.md](../docs/google_tv_app.md)

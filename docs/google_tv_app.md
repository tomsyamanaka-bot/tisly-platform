# Google TV ネイティブアプリ

> **Phase 21–40** — `tv-app/`（Expo / React Native）

## なぜ TV のみネイティブか

- 10-foot UI（大文字・大カード・リモコン操作）
- キオスク（常時表示・スリープ防止）
- 警報時の全画面オーバーレイ
- Leanback ランチャー登録

スマホは **PWA のみ**（`server/public/` + manifest + Service Worker）。

## 画面構成

```
Home (ダッシュボード)
 ├── Security
 ├── Events
 ├── Cameras (プレースホルダー)
 ├── Status
 └── Settings
```

## 警報 UX

1. 通常: Home / Security 監視
2. API で `systemStatus === alarm` または `recentAlarms` 検知
3. `AlarmOverlay` 全画面赤表示
4. 10秒後自動復帰（`platform_settings.tv.alarmFullscreenSec`）

## Google TV モード

`src/theme/tvTheme.ts` — フォント 24–56px、カード min 160px、高コントラスト。

## ビルド

```bash
cd tv-app && npm install && npx expo run:android
```

`app.json` の `LEANBACK_LAUNCHER` で Android TV ホームに表示。

## 未実装（Phase 41+）

- MQTT WebSocket ライブ同期
- RTSP / WebRTC / H.View / Reolink
- 天気 API
- Nest / Alexa

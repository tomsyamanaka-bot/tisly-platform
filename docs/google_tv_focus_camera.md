# Google TV Focus Camera RC2

Phase 1161–1200 の TV カメラフォーカス仕様です。

## イベント

- WebSocket: `type: camera_focus` / `payload.event: focusCamera`
- ペイロード: `customerCode`, `cameraId`, `floor`, `viewLabel`, `durationSec`（既定10秒）

## API

| メソッド | パス | 説明 |
|----------|------|------|
| POST | `/api/tv/focus-camera` | フォーカス開始（MQTT/センサー/PRO Remote から） |
| GET | `/api/tv/:code/state` | 現在のフォーカス状態・残り秒数 |
| POST | `/api/tv/:code/clear-focus` | 手動クリア |

## Web UI (`/tv/:code`)

- 10秒間カメラ拡大オーバーレイ表示
- 終了後通常ダッシュボードへ復帰
- 左下「デモ focus」ボタンで `CAM-DEMO-01` / 外周を試験

## 固定階

屋上は作らず **外周 / 1F / 2F** のみ。

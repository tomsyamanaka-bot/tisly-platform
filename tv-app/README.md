# TiSLY Google TV App

**Phase 41–60** — スマホは PWA、Google TV のみネイティブ。

## 画面

| 画面 | 説明 |
|------|------|
| Home | TV ダッシュボード |
| Security | 警報・監視 |
| Events | イベント（tisly.jp API） |
| Cameras | RTSP/WebRTC プレースホルダー |
| Status | API + **WebSocket 接続状態** |
| Settings | Server URL / Pairing / Site / 表示モード等 |

## 開発

```bash
cd tv-app
npm install
npx expo start
```

Android TV: `npx expo run:android`

### ローカル（server なし）

```bash
EXPO_PUBLIC_MQTT_MOCK=true npx expo start
```

### ローカル（server あり）

```bash
# ターミナル1
cd server && npm run dev

# ターミナル2
EXPO_PUBLIC_API_URL=http://10.0.2.2:3080 EXPO_PUBLIC_MQTT_WS=ws://10.0.2.2:3080/ws npx expo start
```

（実機 IP は環境に合わせて変更）

## 環境変数

| 変数 | 既定 |
|------|------|
| `EXPO_PUBLIC_API_URL` | `https://tisly.jp` |
| `EXPO_PUBLIC_MQTT_WS` | 未設定時は Server URL から `/ws` を導出 |
| `EXPO_PUBLIC_MQTT_MOCK` | `true` でモック heartbeat |

## WebSocket / 警報

- `src/services/mqtt.ts` — `wss://tisly.jp/ws`（設定の Server URL から導出可）
- `AlarmOverlay` — 全画面赤・10秒で復帰（`critical` は解除まで TODO）

## TV ペアリング

Settings の Pairing Code はローカル保存のみ。  
サーバー API 連携は **TODO**（短時間コード検証）。

詳細: [docs/google_tv_app.md](../docs/google_tv_app.md)

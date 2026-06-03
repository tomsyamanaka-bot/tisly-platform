# Live Operations Automation（Phase 701–740）

## WebSocket Live Push

- エンドポイント: `wss://{host}/ws`
- クライアント: `project-dashboard.js` — 接続後 `{ type: "subscribe", projectId }`
- サーバー: `server/src/ws/hub.ts` — 案件フィルタ・heartbeat・再接続
- ブリッジ: `server/src/toms/live-push-bridge.ts`
- Mock プッシュ: `server/src/toms/live-push-mock.ts`（12秒間隔、設備/通知/フロアアラート）

### チャンネル

| channel | 内容 |
|---------|------|
| `devices` | ライブ設備テーブル更新 |
| `notifications` | 未確認通知 |
| `timeline` | タイムライン追記 |
| `floor_alert` | 異常階へのジャンプ＋ピン点滅 |

### MQTT 差し替え

`broadcastFromMqtt` を維持し、案件イベントは `pushProjectDevicesLive` 等を MQTT ハンドラから呼ぶ。

## ステータス API

`GET /api/toms/live/ws-status` — 接続数・mockPush フラグ

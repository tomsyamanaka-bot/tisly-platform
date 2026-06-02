# Node-RED 実機 ingest フロー（Phase 121–140）

## フロー

`node-red/tisly_real_device_ingest_v1.json`

```
MQTT tisly/+/+/+/#
  → Route (event/recovery/heartbeat/state)
  → Unified event 変換
  → POST /api/events/ingest (+ X-TiSLY-Ingest-Secret)
  → retry (max 3, backoff)
  → debug dashboard / error log
heartbeat → POST /api/devices/{device}/heartbeat
```

## 環境変数

| 変数 | 例 |
|------|-----|
| `INGEST_SECRET` | server `.env` と同一 |
| `TISLY_INGEST_URL` | `http://127.0.0.1:3080` |

## インポート

1. Node-RED → メニュー → Import → ファイル選択
2. MQTT broker ノードで VPS / ローカル Mosquitto を指定
3. Deploy 後、debug タブで `event → ingest` / `heartbeat` を確認

## heartbeat 判定

- サーバー `heartbeat-monitor` が `last_heartbeat_at` を更新
- 欠落時は Recovery Engine（Phase 81–100）がトリガー可能

## 本番

- MQTT は VPS 内部、Node-RED も同一ホスト推奨
- `INGEST_SECRET` は必ず本番用にローテーション

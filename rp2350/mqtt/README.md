# TiSLY Home — MQTT 設計

## ブローカー

- 推奨: Mosquitto（LAN 内 Raspberry Pi / NAS / 小型 PC）
- ポート: 1883（TLS は Phase2 以降）

## トピック一覧

| トピック | 方向 | ペイロード | 説明 |
|----------|------|------------|------|
| `tisly/home/di/1` … `8` | 機器→購読 | `0` / `1` | DI 状態（1=検知） |
| `tisly/home/relay/1` … `8` | 機器→購読 | `0` / `1` | リレー状態 |
| `tisly/home/event` | 機器→購読 | JSON | イベントログ |
| `tisly/home/alarm` | 機器→購読 | JSON | アラーム状態（retain） |
| `tisly/home/heartbeat` | 機器→購読 | JSON | 生存確認 |
| `tisly/home/cmd/alarm_clear` | 購読→機器 | `clear` / `1` | アラーム解除（任意） |

## イベント JSON 例

```json
{
  "type": "window",
  "di": 5,
  "name": "窓①",
  "message": "パトライト・ブザー ON"
}
```

## アラーム JSON 例

```json
{
  "active": 1,
  "ts": 1717400000,
  "detail": "emergency"
}
```

## Heartbeat JSON 例

```json
{
  "uptime": 3600,
  "ts": 1717400000,
  "ip": "192.168.1.50"
}
```

## Node-RED / Web UI

- Node-RED: `node-red/tisly_home_v1.json` — `tisly/home/#` を購読
- Web UI: WebSocket 有効時 `ws://<broker>:9001`（Mosquitto の `listener` 設定要）

## テスト用コマンド（mosquitto_pub）

```bash
mosquitto_sub -h 192.168.1.10 -t "tisly/home/#" -v
mosquitto_pub -h 192.168.1.10 -t "tisly/home/cmd/alarm_clear" -m "clear"
```

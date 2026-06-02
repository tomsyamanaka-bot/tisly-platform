# ESP32 実機セットアップ（Phase 121–140）

## 設定ファイル

`esp32/config/` の example をコピーして編集:

- `device.example.json` → `device.json`
- `network.example.json` → `network.json`
- `mqtt.example.json` → `mqtt.json`
- `gpio_map.example.json` → `gpio_map.json`

## Wi-Fi

`network.json` に SSID / パスワード。静的 IP が必要な拠点のみ `static_ip` を設定。

## MQTT

- ブローカー: VPS 内部 `mqtt://127.0.0.1:1883` または TLS `mqtts://tisly.jp:8883`
- トピック: `tisly/{tenant}/{site}/{device_id}/event` 等（`docs/mqtt_unified_topics.md`）

## device_id

`docs/device_id_rules.md` に従い `ESP-` プレフィックス推奨。

## heartbeat

30 秒間隔で `.../heartbeat` に JSON:

```json
{ "status": "ok", "uptime_sec": 12345, "rssi": -62 }
```

## event publish

センサー変化時に `.../event`:

```json
{
  "event_type": "door_open",
  "severity": "warning",
  "zone": "entrance",
  "message": "扉接点 ON"
}
```

## GPIO / リレー

`gpio_map.json` の `logical_name` と実配線を一致させる。

## 疎通テスト

1. `POST /api/devices/register` で登録
2. Mosquitto で subscribe `tisly/default/{site}/{device_id}/#`
3. `POST /api/test/event` でサーバー側通知確認（比較用）
4. 実機から event を 1 件 publish → Node-RED ingest または server MQTT subscriber で確認

# MQTT 統一トピック（Phase 101–120）

## 統一形式

```
tisly/{tenant_id}/{site_id}/{device_id}/{channel}
```

| channel | 方向 | 内容 |
|---------|------|------|
| `state` | デバイス → ブローカー | DI/RO/M 等のスナップショット JSON |
| `event` | デバイス → ブローカー | 統一イベント（または ingest 用サブセット） |
| `heartbeat` | デバイス → ブローカー | 生存・uptime・RSSI 等 |
| `cmd` | クラウド/Node-RED → デバイス | リレー制御・再起動・警戒 ON/OFF |
| `recovery` | 双方向 | 復旧ステップ・playbook 連携（Phase 121+） |

## 例

```
tisly/default/moriya-home/ESP-HOME-001/state
tisly/default/moriya-home/ESP-HOME-001/event
tisly/default/moriya-home/ESP-HOME-001/heartbeat
tisly/default/factory-a/PLC-FACTORY-001/cmd
tisly/default/factory-a/RP-FACTORY-001/recovery
```

## state ペイロード例

```json
{
  "armed": true,
  "di": [0, 0, 1, 0, 0, 0, 0, 0],
  "relay": [0, 0, 0, 1, 0, 0, 0, 0],
  "ts": "2026-06-03T12:00:00+09:00"
}
```

## event ペイロード例

`docs/unified_event_format.md` のフィールドを推奨。  
Node-RED が HTTP ingest へ変換する。

## heartbeat ペイロード例

```json
{
  "ok": true,
  "uptime_sec": 86400,
  "rssi": -62,
  "fw": "1.0.0"
}
```

## cmd ペイロード例

```json
{
  "action": "relay_set",
  "channel": 3,
  "value": 1,
  "request_id": "cmd-uuid"
}
```

```json
{
  "action": "restart",
  "request_id": "restart-uuid"
}
```

server の `POST /api/devices/:id/restart-request` は MQTT `cmd` へのヒントを WebSocket で通知（実装はデバイス側）。

---

## 旧トピックからの移行 TODO

### ESP（旧）

- [ ] `tishly/home/security/state/*` → 統一 `state` + payload 内キー
- [ ] `tishly/home/security/event/alarm` → `.../event`

### RP2350（旧）

- [ ] `tisly/rp2350/rp2350-home-01/state` → `tisly/default/{site_id}/RP-HOME-001/state`
- [ ] `tisly/rp2350/.../alarm` → `.../event`（severity 付き）
- [ ] Node-RED `tisly_rp2350_v1.json` を `tisly_real_device_ingest_v1.json` に切替

### PLC（旧）

- [ ] README 記載の `tishly/home/security/state/armed` 等 → PLC ノードの `device_id` 配下へ
- [ ] Modbus/RS ミラーは ESP/RP が PLC から読み取り MQTT へ

### ブローカー ACL

- [ ] tenant / site 単位の publish/subscribe 制限
- [ ] 本番は TLS + ユーザー別パスワード

### ファームウェア

- [ ] `rp2350/config/mqtt.json` — topic_prefix 更新
- [ ] `esp32/config/`（新規）— 統一トピック
- [ ] 移行期間は Node-RED で旧→新ブリッジ可

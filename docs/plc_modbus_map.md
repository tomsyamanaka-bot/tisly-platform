# PLC Modbus マップ（Phase 121–140）

実装参照: `server/src/plc/modbus-map.ts`

## 仮マップ（FX 系想定）

| 論理名 | エリア | アドレス | 役割 |
|--------|--------|----------|------|
| emergency_stop | X | 0 | 非常停止入力 |
| door_contact | X | 1 | 扉接点 |
| ir_beam | X | 2 | 赤外線 |
| patlite | Y | 0 | パトライト出力 |
| buzzer | Y | 1 | ブザー |
| light_zone_a | Y | 2 | ライト |
| alarm_latch | M | 100 | 内部リレー（警報ラッチ） |
| heartbeat_ok | M | 101 | heartbeat 正常 |
| alarm_code | D | 0 | 警報コード |
| heartbeat_counter | D | 1 | heartbeat |
| site_status | D | 10 | 拠点状態 |

## イベント変換

`plc-event-converter.ts` — Modbus 読取 → `UnifiedEvent`（source_type: `plc`）

## コマンド

`plc-command-builder.ts` — `patlite_on`, `buzzer_off`, `reset_alarm` 等 → Modbus write + MQTT cmd トピックヒント

## 実機到着後

GX Works のデバイス割付と照合し、アドレスを確定して `modbus-map.ts` を更新する。

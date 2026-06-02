# TiSLY RP2350 Edition — TODO

実機未到着・未検証項目。完了したら `[x]` に更新。

## 実機到着後（必須）— Phase 101–120

- [ ] **Waveshare公式ピン番号確認** — Wiki `01_GPIO` / シルクと `config/gpio_map.json` の `gpio_pin` を記入
- [ ] **Ethernetライブラリ確定** — 公式 `02_MQTT` から `firmware/ethernet_mqtt.py` を移植・動作確認
- [ ] **MQTTライブラリ確定** — 同梱 `umqtt` / Waveshare サンプルとの互換
- [ ] **DI/RO論理確認** — NPN/PNP・NC/NO と `device.json` の `active_low`、RO 極性を実測
- [ ] **リレーON/OFF実測** — `relay_map.json` にアクティブ High/Low を記録
- [ ] **100V接続前テスター確認** — RO1/RO2 の COM/NO 導通のみ（負荷未接続）
- [ ] **config/gpio_map.json 差し替え** — 公式ピン表に合わせ全チャネル更新
- [ ] **統一 MQTT トピック** — `docs/mqtt_unified_topics.md`（`RP-HOME-001` 等）
- [ ] **Node-RED** — `node-red/tisly_real_device_ingest_v1.json` + heartbeat 30s
- [ ] **server 登録** — `POST /api/devices/register` — `RP-HOME-001`
- [ ] **Web UI実機連携** — `state` / `event` の表示

## ハードウェア

- [ ] RP2350-POE-ETH-8DI-8RO 受領・通電（7〜36V / PoE）
- [ ] 24V センサー電源・DI 配線
- [ ] RO3 パトライト / RO4 ブザー 配線
- [ ] デフォルト DI-リレー連動が有効な場合は無効化（ファームのみ制御）

## ファームウェア

- [ ] MicroPython ファーム書き込み（`docs/rp2350_first_setup.md`）
- [ ] ボードへ `config/` + `firmware/*.py` デプロイ
- [ ] シリアルログ・heartbeat 30s 確認
- [ ] RS485 / Modbus は Phase 21 以降

## MQTT / インフラ

- [ ] Mosquitto + `mqtt/mosquitto_snippet.conf`
- [ ] `config/mqtt.json` / `network.json` の IP・認証
- [ ] WebSocket 9001（Web UI 用）

## PC上テスト（実機不要）

- [x] `test/simulator/test_logic_host.py` — 論理スモーク
- [ ] `test/simulator/simulator_publish.py` — ブローカーへ疎通
- [ ] `test/simulator/simulator_inputs.py` — 対話シミュレーション

## Phase 完了（Phase 11〜20）

| Phase | 内容 | 状態 |
|-------|------|------|
| 11 | config 整備（device/network/mqtt/gpio/relay/sensor） | 完了 |
| 12 | gpio_map TODO 化 | 完了 |
| 13 | ファームモジュール分割 | 完了 |
| 14 | 動作ルール（safety_manager） | 完了 |
| 15 | MQTT トピック `tisly/rp2350/...` | 完了 |
| 16 | PC シミュレータ | 完了 |
| 17 | Node-RED `tisly_rp2350_v1.json` | 完了 |
| 18 | Web UI（6ページ・状態色） | 完了 |
| 19 | `docs/rp2350_first_setup.md` | 完了 |
| 20 | README / TODO 更新 | 完了 |
| — | **実機接続テスト** | **実機待ち** |

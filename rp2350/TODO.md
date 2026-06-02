# TiSLY RP2350 Edition — TODO

実機未到着・未検証項目。完了したら `[x]` に更新。

## 実機到着後（必須）

- [ ] **Waveshare公式ピン番号確認** — Wiki `01_GPIO` / シルクと `config/gpio_map.json` の `gpio_pin` を記入
- [ ] **リレーON/OFF論理確認** — RO 出力のアクティブ High/Low を実測（`relay_map.json` に記録）
- [ ] **DI入力のプルアップ/プルダウン確認** — NPN/PNP・NC/NO と `device.json` の `active_low` を一致
- [ ] **Ethernetライブラリ確認** — 公式 `02_MQTT` から `firmware/ethernet_mqtt.py` を移植・動作確認
- [ ] **MQTTライブラリ確定** — 同梱 `umqtt` / Waveshare サンプルとの互換
- [ ] **実機でDI/RO単体テスト** — 負荷なしで DI 反応・RO クリック音/LED
- [ ] **100Vライト接続前のテスター確認** — RO1/RO2 の COM/NO 導通のみ
- [ ] **Node-RED実機連携確認** — `tisly_rp2350_v1.json` + heartbeat 30s
- [ ] **Web UI実機連携確認** — `state` / `event` / `alarm` の表示

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

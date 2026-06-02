# RP2350 実機到着後セットアップ手順

Waveshare **RP2350-POE-ETH-8DI-8RO** 向け。実機到着前は `test/simulator/` で MQTT・Node-RED・Web UI を確認できます。

## 1. MicroPython 書き込み

1. [Waveshare Wiki](https://www.waveshare.com/wiki/RP2350-ETH-8DI-8RO) の **MicroPython ファームウェア** をダウンロード
2. BOOT ボタン押下しながら USB 接続 → ストレージ `RPI-RP2` が出る
3. `.uf2` をドラッグ＆ドロップ
4. シリアルコンソール（115200）で REPL 応答を確認

> **TODO**: 同梱バージョンと `ethernet_mqtt.py` 移植元（公式 `02_MQTT`）のバージョン一致を記録

## 2. config 差し替え

ボード直下に以下をコピー:

```
config/
  device.json
  network.json
  mqtt.json
  gpio_map.json   ← 公式ピン確定後に gpio_pin を記入
  relay_map.json
  sensor_map.json
firmware/
  *.py
```

編集項目:

| ファイル | 内容 |
|----------|------|
| `network.json` | DHCP または固定 IP |
| `mqtt.json` | ブローカー IP・`device_id` |
| `gpio_map.json` | **公式資料照合後** DI/RO ピン番号 |
| `device.json` | `active_low`（DI 極性） |

## 3. LAN 接続確認

1. PoE または LAN + 別途 DC 電源（7〜36V、定格確認）
2. `network.json` に合わせて ping（固定 IP の場合）
3. 公式 `02_MQTT` サンプルでリンクアップ確認（未移植時）

## 4. MQTT 接続確認

1. Mosquitto 起動（`mqtt/mosquitto_snippet.conf` 参照）
2. `mqtt.json` の `broker_host` を設定
3. ファーム起動後、購読:

```bash
mosquitto_sub -h 192.168.1.10 -t "tisly/rp2350/rp2350-home-01/#" -v
```

4. **30秒以内**に `.../heartbeat` が届くこと

## 5. DI テスト

| DI | 操作 | 期待 |
|----|------|------|
| DI1/DI2 | 赤外線 ON | RO1/RO2 ON、`event` type `ir_beam` |
| DI3/DI4 | 人感 ON | `event` のみ（RO 変化なし） |
| DI5/DI6 | 窓 ON | RO3/RO4 ON、`window_alarm` |
| DI7 | 非常 ON | 全 RO ON、`alarm_mode: true`、alarm retain |

チャタリング: **50ms** デバウンス済み。

## 6. RO テスト

- **100V 負荷接続前**: テスターで COM/NO 導通のみ確認
- RO1/RO2: 赤外線連動
- RO3/RO4: 窓連動
- RO5〜8: 予備（非常時は全 ON）

> **TODO**: リレー ON/OFF 論理（アクティブ High/Low）を実測で記録

## 7. Node-RED 表示確認

1. `node-red/tisly_rp2350_v1.json` をインポート
2. MQTT ブローカーノードの IP を設定
3. Dashboard: `http://<host>:1880/ui`
4. シミュレータ `simulator_inputs.py` でイベントがログに残ること

## 8. Web UI 表示確認

1. `web/` を HTTP 配信（例: `python -m http.server 8080 -d rp2350/web`）
2. Settings で WebSocket URL（例: `ws://192.168.1.10:9001`）
3. 状態色: 正常=緑 / 注意=黄 / 警報=赤 / 通信断=グレー

## 9. 異常時の切り分け

| 症状 | 確認 |
|------|------|
| heartbeat なし | LAN・ブローカー IP・ファームログ・`ethernet_mqtt.py` |
| DI 反応なし | `gpio_map.json` ピン・プルアップ/プルダウン・24V 配線 |
| RO 動かない | リレー論理・負荷側ヒューズ・非常 alarm_mode 継続中か |
| MQTT 届くが UI 更新なし | トピックが `tisly/rp2350/...` か（旧 `tisly/home` ではない） |
| Web のみ灰色 | WebSocket 9001 有効化・ファイアウォール |

アラーム解除: `tisly/rp2350/{device_id}/cmd/alarm_clear` に `clear` を publish。

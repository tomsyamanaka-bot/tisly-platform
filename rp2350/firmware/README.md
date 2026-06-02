# TiSLY RP2350 ファームウェア

MicroPython（Waveshare RP2350-POE-ETH-8DI-8RO 向け）で **TiSLY Home Security v1** を実装します。

## 前提

- 公式 Wiki の **RP2350B 用 MicroPython** ファームウェアを書き込み済みであること
- Waveshare 同梱の `lib/`（W5500 / MQTT 用）をボードに配置（実機到着後に同梱 ZIP からコピー）

## ファイル構成

| ファイル | 説明 |
|----------|------|
| `main.py` | エントリ（起動時に `tisly_app.run()`） |
| `tisly_app.py` | メインループ・DI監視・MQTT |
| `tisly_logic.py` | 動作ルール（赤外線・窓・非常） |
| `hardware_board.py` | GPIO / リレー制御 |
| `mqtt_client.py` | トピック publish / 購読 |
| `config_store.py` | `/config` JSON 読込（初回は PC からアップロード） |

## 書き込み手順（実機到着後）

1. Thonny で RP2350 に接続
2. `config/*.json` をボード直下 `config/` にコピー
3. Waveshare `lib/` をボードにコピー
4. `firmware/*.py` をボード直下にコピー
5. `main.py` をリネームせず配置し、リセットまたは `main.py` 実行

## 動作確認（最小）

- シリアル: `TiSLY RP2350 boot` ログ
- MQTT: `tisly/home/heartbeat` が 30 秒周期
- DI1 ショート（テストジャンパ）→ `tisly/home/di/1` = `1`、RO1 ON

## チャタリング

`config/device.json` の `debounce_ms`（既定 50ms）を使用。

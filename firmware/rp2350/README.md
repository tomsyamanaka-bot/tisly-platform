# TiSLY RP2350 Production Firmware

対象は Waveshare `RP2350-POE-ETH-8DI-8RO` と
MicroPython です。既存の `rp2350/firmware/` は
検証資産として残し、本ディレクトリを実機配備用とします。

## 配備

1. Waveshare 推奨 MicroPython を書き込みます。
2. 管理画面 `/device-binding-v1` で機器と16ポートを保存します。
3. 画面のダウンロードボタンから `config.json` と `main.py` を取得します。
4. `network_manager.py` と `pulse_counter.py` もボード直下へ転送します。
5. PoE LAN を接続して再起動します。

`config.json` の `device_token` は認証情報です。
公開リポジトリや写真へ載せないでください。

## 動作

- Ethernet DHCP を自動取得
- DI1〜DI8 を50ms以上デバウンス
- パルス積算値を `pulse_counts.json` へ退避
- 入力変化と定期通信で telemetry を送信
- 緊急入力ON時は専用APIへ即時POST
- RO1〜RO8命令を3秒ごとに取得

Flash摩耗を抑えるため、通常のパルス値は既定5秒単位で保存します。
緊急入力時と正常終了時は即時保存します。

## 実機確認

GPIOは Waveshare 02_MQTT サンプルに合わせ、
DI1〜DI8をGPIO9〜16、RO1〜RO8をGPIO17〜24、
W5500をGPIO33〜36 / reset GPIO25としています。
基板リビジョン変更時は公式Wikiとシルクを照合してください。

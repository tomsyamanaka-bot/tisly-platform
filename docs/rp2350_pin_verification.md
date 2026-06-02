# RP2350 ピン検証手順（Phase 121–140）

## 対象ボード

Waveshare **RP2350-POE-ETH-8DI-8RO** — 設定: `rp2350/config/gpio_map.json`

## 検証ステータス

| 項目 | verify_status |
|------|----------------|
| DI1–DI8 | `pending`（gpio_pin = null） |
| RO1–RO8 | `pending` |
| W5500 SPI | `pending` |

## 手順（実機到着後）

1. [公式 Wiki](https://www.waveshare.com/wiki/RP2350-ETH-8DI-8RO) の **01_GPIO** / **02_MQTT** を開く
2. シルク表示とサンプルコードのピン番号を `gpio_map.json` に転記
3. 各 DI にテスト接点を接続し、MQTT `state` で変化を確認
4. 各 RO を 1 秒パルス出力し、リレー動作を目視確認
5. `verify_status` を `verified` に更新し、日付を `hardware_note` に記録

## 安全

- 非常停止（DI7 / `emergency`）は **常時監視**、active_low を実配線に合わせる
- 100V リレーは実負荷接続前に **無負荷** で動作確認

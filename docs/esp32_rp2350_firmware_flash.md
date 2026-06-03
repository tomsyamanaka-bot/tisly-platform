# ESP32 / RP2350 ファーム書き込み準備

## firmware config（ビルド時）

| 項目 | 例 |
|------|-----|
| `device_id` | `TOMS-GATE-01` |
| `customer_code` | `TOMS001` |
| `site_id` | UUID from Site Builder |
| `MQTT_TOPIC_PREFIX` | `tisly/{site_id}/` |

## 証明書

1. 施工 PWA で CSR 登録 → `cert/issue`
2. 発行 PEM を `certs/device.pem` / `ca.pem` としてフラッシュ
3. mTLS ポート: **8883**（placeholder）

## ネットワーク

- Wi-Fi: SSID/PSK は現場設定（NVS）
- Ethernet: RP2350 / ESP32-S3 ボード依存

## ランタイム

- **Heartbeat**: `tisly/{site}/{device_id}/heartbeat`
- **Factory reset**: GPIO 長押し → NVS クリア → bootstrap QR

## 書き込み手順（概要）

1. `idf.py` / `arduino-cli` でビルド
2. `esptool.py write_flash` または `picotool load`
3. シリアルで provisioning URL / QR を確認
4. 施工 PWA で疎通・RTT・チェックリスト完了

# TiSLY システム概要 — CARSHOP_NIGHT_SECURITY

**TiSLY PLC Builder v5.14 — TISLY_SYSTEM.md**

## 案件概要

- **案件名**: CARSHOP_NIGHT_SECURITY
- **目的**: 夜間の侵入検知と警告表示
- **Device ID**: `211`

---

## 1. PLC

| 項目 | 内容 |
|------|------|
| 型番 | FX5UJ-24MR/ES |
| 入力点数 | 8 |
| 出力点数 | 5 |
| プログラム | `PLC_PROGRAM/GX3_COMMANDS.txt` |
| I/O 表 | `SPEC/IO_ASSIGNMENT.csv` |

---

## 2. ESP32 ゲートウェイ

- **役割**: PLC 接点状態の読取・MQTT ブリッジ
- **設定ファイル**: `TISLY/ESP_CONFIG.json`
- **Client ID**: `tisly-esp-211`
- **入力**: 8 点
- **出力**: 5 点

---

## 3. MQTT

- **Broker**: `mqtt.tisly.local:1883`
- **トピック定義**: `TISLY/MQTT_TOPICS.md`

| トピック | 用途 |
|----------|------|
| `tisly/device/211/state` | 全体状態 |
| `tisly/device/211/alarm` | 警報入力 |
| `tisly/device/211/motion` | 動体検知 |
| `tisly/device/211/output` | 出力制御 |

---

## 4. Node-RED

- **設定ファイル**: `TISLY/NODE_RED_CONFIG.json`
- **Alarm 入力**: EStop_01, Beam_01, Beam_02, Beam_03, Beam_04
- **Motion 入力**: PIR_01, PIR_02
- **Contact 入力**: Switch_01
- **出力**: Siren, WhiteLight_01, WhiteLight_02, WhiteLight_03, WhiteLight_04

---

## 5. Push 通知

- 警報（ALARM）検知時に TiSLY アプリへ Push 通知
- 動体検知（MOTION）は設定により通知 ON/OFF 切替可能
- Node-RED フロー経由で Firebase / APNs 連携（`TISLY/TISLY_FLOWS.json` — v5.15 で自動生成）

---

## 6. I/O ↔ TiSLY デバイスマップ

| PLC | TiSLY Name | Signal |
|-----|------------|--------|
| X0 | Switch_01 | CONTACT |
| X1 | EStop_01 | ALARM |
| X2 | Beam_01 | ALARM |
| X3 | Beam_02 | ALARM |
| X4 | Beam_03 | ALARM |
| X5 | Beam_04 | ALARM |
| X6 | PIR_01 | MOTION |
| X7 | PIR_02 | MOTION |
| Y0 | Siren | OUTPUT |
| Y1 | WhiteLight_01 | OUTPUT |
| Y2 | WhiteLight_02 | OUTPUT |
| Y3 | WhiteLight_03 | OUTPUT |
| Y4 | WhiteLight_04 | OUTPUT |

---

## 7. 将来連携

- **TiSLY UI ダッシュボード**: リアルタイム状態表示・履歴
- **クラウド録画連携**: 警報トリガーでカメラクリップ保存
- **v5.15 Node-RED フロー自動生成**: `TISLY/TISLY_FLOWS.json` を案件ごとに出力
- **リモートメンテナンス**: OTA ファームウェア更新

---

*TiSLY PLC Builder v5.14 — TiSLY Integration Engine*

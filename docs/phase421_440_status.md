# Phase 421–440 Status

**First Device Commissioning & Demo Kit Integration** — 完了

## 実装サマリ

| # | 項目 | 状態 |
|---|------|------|
| 1 | First Device Wizard | `/customer/:code/install/device-onboard` |
| 2 | Device State Engine | `device_status` + `first_seen` / `last_seen` |
| 3 | Heartbeat Monitor | 5分 WARNING / 15分 OFFLINE |
| 4 | Device Timeline | `device_timeline` テーブル + API |
| 5 | Map Live | 緑/黄/赤 + 点滅 CSS |
| 6 | TV Device Health | TV API + 画面 |
| 7 | Demo Kit | `docs/demo_kit_v1.md` |
| 8 | Demo Mode | `DEMO_MODE` + 仮想 ESP |
| 9 | Event Simulator | Health 画面 + API |
| 10 | Notification Test Center | 一括送信 API |
| 11 | Provisioning Report | HTML/PDF |
| 12 | Health Dashboard | `/customer/:code/health` |
| 13 | SOC/NOC 強化 | 顧客別 device + 最終イベント |
| 14 | DEMO001 | `seed-customers.ts` |
| 15 | テスト | 4 ファイル追加 |

## Phase 441–460 候補

- Mosquitto/EMQX ACL 本番テンプレ同梱
- ESP32 ファームウェアリポジトリ + CI 実機 smoke
- ACME/社内 CA 本番連携
- Background Sync + JWT refresh 本番
- S3 dual-write + QNAP

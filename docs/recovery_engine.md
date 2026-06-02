# TiSLY Recovery Engine（Phase 81–100）

## 概要

Heartbeat 断・デバイスオフライン等を検知し、ルールに従い **Warning → 再接続 → 通知 → エスカレーション** を実行します。

## モジュール

| パス | 内容 |
|------|------|
| `server/src/recovery/recovery-engine.ts` | エンジン起動・イベント連携 |
| `server/src/recovery/recovery-rules.ts` | 標準ルール定義 |
| `server/src/recovery/device-recovery.ts` | ESP / RP2350 / PLC / TV / Server / Node-RED / MQTT |
| `server/src/recovery/escalation-engine.ts` | 30秒 / 5分 / 30分 エスカレーション |
| `server/src/recovery/incident-timeline.ts` | 異常→通知→対応→復旧の時系列 |
| `server/src/recovery/playbook.ts` | 異常別手順書 |
| `server/src/recovery/sla-monitor.ts` | 稼働率・復旧率・MTTR |

## 標準フロー（Heartbeat 断）

```
Heartbeat断 → Warning → 再接続試行(30s) → 通知(60s) → エスカレーション(5min)
```

## API

- `GET /api/recovery/overview`
- `GET /api/recovery/sla`
- `GET /api/recovery/timeline`
- `GET /api/recovery/playbook/:eventType`
- `POST /api/recovery/run/:deviceId`

## SLA / MTTR

- **稼働率**: デバイス heartbeat_status=ok の比率
- **復旧率**: クローズ済みインシデント比率
- **MTTR**: Mean Time To Recovery（分）

## PLC Builder 連携

`PLC_TEMPLATE_BUILDER` の `RECOVERY_CONFIG.json` は設計雛形。ランタイムは server 側 Recovery Engine が担当。

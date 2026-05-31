# QNAP ログ保存 — CARSHOP_NIGHT_SECURITY

**TiSLY PLC Builder v5.24 — QNAP Log Export Template**

## 概要

TiSLY システムログを QNAP NAS へ保存するためのスキーマ定義です。

## ログ種別

| 種別 | ファイル | 用途 |
|------|----------|------|
| alarm_log | alarm_YYYY-MM-DD.jsonl | 警報イベント |
| state_log | state_YYYY-MM-DD.jsonl | 状態変化 |
| heartbeat_log | heartbeat_YYYY-MM-DD.jsonl | 死活監視 |
| recovery_log | recovery_YYYY-MM-DD.jsonl | 復旧操作 |

## QNAP 設定

1. 共有フォルダ `TiSLY/logs/CARSHOP_NIGHT_SECURITY` を作成
2. Node-RED / Recovery Engine から JSONL 追記
3. 90日ローテーション（LOG_SCHEMA.json 参照）

## サンプル行 (alarm_log)

```json
{"timestamp":"2026-05-31T12:00:00Z","device_id":"100","alarm_name":"Beam_01","plc_device":"X2","value":1,"ack":false}
```

---

*生成: 2026-05-31 06:05 UTC*
*TiSLY PLC Builder v5.24 — QNAP Log Export Template*

# TiSLY Recovery Engine — CARSHOP_NIGHT_SECURITY

**TiSLY PLC Builder v5.23 — Recovery Engine Template**

## 概要

デバイス死活監視・オフライン判定・Shelly 再起動候補・通知条件・復旧ログの雛形設定です。

## RECOVERY_CONFIG.json

| セクション | 内容 |
|------------|------|
| heartbeat | ハートビート間隔 / オフライン閾値 |
| offline_detection | オフライン判定ロジック |
| shelly_restart | Shelly 再起動候補リスト |
| notification | 通知チャネル / エスカレーション |
| recovery_log | 復旧ログ形式 |

## 運用手順

1. `shelly_restart.candidates` に Shelly デバイス IP を追加
2. Node-RED Recovery フローと連携
3. QNAP / ログサーバーへ `recovery_log` を転送

---

*生成: 2026-05-31 06:05 UTC*
*TiSLY PLC Builder v5.23 — Recovery Engine Template*

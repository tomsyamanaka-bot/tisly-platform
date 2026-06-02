# TiSLY SOC / NOC Dashboard（Phase 81–100）

## SOC — Security Operations Center

セキュリティ運用者向け。侵入・外周・Zone・AI リスクに焦点。

- **UI**: `/operations` → SOC モード、`/analytics`
- **API**: `GET /api/ops/soc`
- **内容**: 警報一覧、AI サマリー、自然言語レポート、オープンインシデント数

## NOC — Network Operations Center

ネットワーク・通信運用向け。Heartbeat・MQTT・オフラインデバイス・SLA。

- **UI**: `/operations` → NOC モード
- **API**: `GET /api/ops/noc`
- **内容**: デバイスヘルス、オフライン一覧、稼働率、MTTR

## 切替

`localStorage: tisly.operatorMode` = `soc` | `noc`

Google TV: `tvSettings.ts` に `OperatorMode` 型あり（UI 連携は将来拡張）。

## 営業デモ

1. `npm run demo`
2. `/operations` で SOC → 警報・マップ
3. `/analytics` で Risk・Recovery・Incident
4. `/sales` で顧客向け AI インサイト

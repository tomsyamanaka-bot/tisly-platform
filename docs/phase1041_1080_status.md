# Phase 1041–1080 Status — Production Device Connection, Shelly Provisioning & Customer Onboarding

**完了日**: 2026-06-05  
**前提**: Phase 1001–1040 First Customer Deployment Kit 完了済み

## 概要

初回顧客導入キットを「営業デモ」から「現場投入前の実運用準備」へ拡張。  
MQTT 実機接続チェック · Shelly Gen3 プロビジョニング · 施工 PWA ファイナライズ · 顧客オンボーディング一括化。

## 実装一覧

| Phase | 領域 | 主要ファイル |
|-------|------|-------------|
| 1041–1050 | 本番 MQTT 接続チェック | `deployment-mqtt.ts`, `/api/deployment/mqtt/*` |
| 1051–1060 | Shelly Gen3 プロビジョニング | `shelly-provisioning.ts`, `/api/shelly/*` |
| 1061–1070 | 施工 PWA ファイナライズ | `installer-field-checklist.ts`, `installer-home.*` |
| 1071–1080 | 顧客オンボーディング | `customer-onboarding.ts`, `/onboarding/new` |

## API 一覧

| メソッド | パス | 認証 |
|----------|------|------|
| GET | `/api/deployment/mqtt/status` | なし |
| POST | `/api/deployment/mqtt/test-heartbeat` | admin |
| GET | `/api/shelly/status` | なし |
| POST | `/api/shelly/register` | admin |
| POST | `/api/shelly/reboot` | なし |
| POST | `/api/shelly/test` | なし |
| POST | `/api/customer-onboarding/create` | admin |
| GET | `/api/customer/:code/install/field-checklist` | viewer+ |
| PUT | `/api/customer/:code/install/field-checklist/:itemId` | installer+ |
| GET | `/api/customer/:code/install/home-cards` | viewer+ |

## UI ルート

| パス | 用途 |
|------|------|
| `/onboarding/new` | 新規導入ウィザード（一括登録） |
| `/customer/:code/install/home` | 施工員ホーム（強化版） |

## 環境変数

```env
MQTT_MODE=mock|real
MQTT_URL=mqtt://127.0.0.1:1883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_TOPIC_PREFIX=tisly

SHELLY_MODE=mock|real
SHELLY_BASE_URL=
SHELLY_AUTH_TOKEN=
```

## テスト

- `server/test/deployment-mqtt.test.ts`
- `server/test/shelly-provisioning.test.ts`
- `server/test/customer-onboarding.test.ts`
- `server/test/installer-finalize.test.ts`

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

## 次フェーズ候補 (1081–1120)

- 実機 ESP32 ファームウェア OTA 配信
- Mosquitto ACL 本番適用と証明書ローテーション
- Shelly テレメトリ常時ポーリング → アラート連携
- 施工完了 → QNAP 自動アーカイブ
- 顧客ポータル初回ログインウィザード

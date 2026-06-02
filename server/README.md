# TiSLY Notification Platform

ConoHa VPS / **tisly.jp** 上で動作する通知コア（Phase 21–40）。

## アーキテクチャ

```
ESP / RP2350 / PLC → MQTT (VPS) → Node-RED → MQTT
                              ↓
                    notification-service.ts
                              ↓
              Web Push | Discord | Email
                              ↓
                    PWA / Google TV App
```

## 起動

```bash
cd server
cp .env.example .env
npm install
npm run db:init
npm run dev
```

- 管理 UI: http://localhost:3080/
- 通知センター: http://localhost:3080/notifications
- Platform Settings: http://localhost:3080/settings

## API

| パス | 説明 |
|------|------|
| `GET /api/events` | イベント一覧 |
| `POST /api/events` | イベント投入 |
| `GET /api/notifications` | 通知ログ |
| `POST /api/notifications/subscribe` | Web Push 登録 |
| `GET /api/devices` | デバイス一覧 |
| `POST /api/heartbeat` | ハートビート |
| `GET /api/dashboard` | ダッシュボード |
| `GET /api/settings/platform` | プラットフォーム設定 |

## DB

SQLite: `server/data/tisly_notifications.db`（`TISLY_DB_PATH` で変更可）

テーブル: `users`, `devices`, `notification_tokens`, `notification_rules`, `notification_logs`, `notification_queue`

## VAPID (Web Push)

```bash
npx web-push generate-vapid-keys
```

`.env` に `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` を設定。

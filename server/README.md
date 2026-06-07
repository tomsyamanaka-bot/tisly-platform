# TiSLY Notification Platform

ConoHa VPS / **tisly.jp** 上で動作する通知コア（**Phase 41–60**: 本番化準備）。

## 方針

- **PWA**（`server/public/`）— スマホは Web Push
- **Google TV** — `tv-app/` ネイティブのみ
- **MQTT** — VPS 内部（`127.0.0.1`）、外部非公開
- **Node-RED** — MQTT 受信後 `POST /api/events/ingest` で server へ
- **WebSocket** — `wss://tisly.jp/ws`（TV / プレビュー）

## ローカル起動

```bash
cd server
cp .env.example .env
# VAPID / INGEST_SECRET 等を編集（秘密はコミットしない）
npm install
npm run db:init
npm run build
npm run dev
```

| URL | 説明 |
|-----|------|
| http://localhost:3080/ | 管理ダッシュボード + Push 登録 |
| http://localhost:3080/notifications | 通知センター |
| http://localhost:3080/settings | Platform Settings |
| http://localhost:3080/tv | TV WebSocket プレビュー |
| ws://localhost:3080/ws | WebSocket |

## 本番デプロイ（テンプレートのみ）

- `deploy/systemd/` — systemd ユニット
- `deploy/nginx/tisly.jp.conf` — nginx
- `docs/vps_production_deploy.md` — 手順書

## API（抜粋）

| パス | 説明 |
|------|------|
| `GET /api/events` | イベント一覧 |
| `POST /api/events` | イベント投入（レガシー） |
| `POST /api/events/ingest` | Node-RED 統一形式 ingest |
| `GET /api/notifications` | 通知ログ |
| `POST /api/notifications/subscribe` | Web Push 登録 |
| `POST /api/notifications/test` | テスト通知 |
| `POST /api/notifications/read-all` | 全既読 |
| `POST /api/notifications/:id/read` | 既読 |
| `GET /api/notifications/vapid-public-key` | VAPID 公開鍵 |
| `GET /api/dashboard` | ダッシュボード |
| `GET /health` | ヘルスチェック |

## DB

SQLite（`TISLY_DB_PATH`）。テーブル: `events`, `device_heartbeats`, `tv_devices`, `pwa_subscriptions`, `notification_logs`, `notification_queue`, `platform_settings` 他。

PostgreSQL 移行は TODO（`docs/unified_event_format.md`）。

## VAPID

`docs/web_push_setup.md` 参照。

```bash
npx web-push generate-vapid-keys
```

## 環境変数

`/.env.example` に全項目のテンプレートあり。

## Remote Test PoC（Phase 2）

通信PoC — iPhone から通知 & CH1 遠隔操作。

| URL | 説明 |
|-----|------|
| https://tisly.jp/remote-test | 本番 Web UI |
| http://localhost:3080/remote-test | ローカル |

### 最小 .env 設定

```bash
cp .env.sample .env
# REMOTE_TEST_TOKEN=（openssl rand -hex 16）
# DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### 起動

```bash
npm install
npm run build
npm run dev   # 開発
npm start     # 本番ビルド後
```

### 本番デプロイ

詳細: [`docs/remote-test-phase2-deploy.md`](../docs/remote-test-phase2-deploy.md)

```bash
cd /opt/tisly && bash scripts/deploy.sh
sudo systemctl restart tisly-server
```

### API

| パス | 説明 |
|------|------|
| `GET /api/remote-test/status` | 状態・デバッグ情報 |
| `POST /api/remote-test/notify` | 通知テスト |
| `POST /api/remote-test/ch1/on` | CH1 ON キュー |
| `POST /api/remote-test/ch1/off` | CH1 OFF キュー |
| `GET /api/remote-test/command` | RP2350 ポーリング |

認証: ヘッダ `X-Remote-Test-Token` または `Authorization: Bearer`

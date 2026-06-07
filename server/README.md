# TiSLY Notification Platform

ConoHa VPS / **tisly.jp** 上で動作する TiSLY コア（PWA 中心アーキテクチャ）。

## 方針

正式方針: [`docs/tisly_core_policy.md`](../docs/tisly_core_policy.md)

- **PWA 中心** — 他社 SaaS に依存しない
- **通知優先順位**: PWA Push → 将来 SMS → 将来 Email
- **Discord / LINE / Slack / Chatwork** — 標準機能にしない（optional）
- **認証**: TiSLY 独自 JWT（Admin / Manager / User）
- **Google TV** — `tv-app/` ネイティブのみ
- **MQTT** — VPS 内部（`127.0.0.1`）、外部非公開

## ローカル起動

```bash
cd server
cp .env.example .env
npm run vapid:setup    # VAPID 未設定なら .env へ自動書込み
npm install
npm run db:init
npm run build
npm run dev
```

| URL | 説明 |
|-----|------|
| http://localhost:3080/tisly-app/home | TiSLY App（Home / Devices / Events / Settings） |
| http://localhost:3080/remote-test | Remote Test PoC |
| http://localhost:3080/ | 管理ダッシュボード |
| http://localhost:3080/settings | Platform Settings |

## VAPID

```bash
npm run vapid:setup              # 未設定なら .env へ自動書込み
npm run vapid:generate -- --check
```

詳細: [`docs/vapid_env_setup.md`](../docs/vapid_env_setup.md)

## Remote Test PoC

通信 PoC — iPhone PWA Push 通知 & RP2350 CH1 遠隔操作。

| Phase | 内容 |
|-------|------|
| Phase 1 | Web Push 通知 |
| Phase 2 | CH1 ON/OFF |
| Phase 3 | RP2350 状態取得 |

| URL | 説明 |
|-----|------|
| https://tisly.jp/remote-test | 本番 Web UI |
| http://localhost:3080/remote-test | ローカル |

### 最小 .env 設定

```bash
cp .env.sample .env
# REMOTE_TEST_TOKEN=（openssl rand -hex 16）
npm run vapid:setup
```

### API

| パス | 説明 |
|------|------|
| `GET /api/remote-test/status` | 状態・Push メタデータ |
| `GET /api/remote-test/device` | RP2350 接続状態（online/offline/lastSeen/firmwareVersion） |
| `POST /api/remote-test/notify` | Push テスト送信 |
| `POST /api/remote-test/ch1/on` | CH1 ON キュー |
| `POST /api/remote-test/ch1/off` | CH1 OFF キュー |
| `GET /api/remote-test/command` | RP2350 ポーリング |

認証: ヘッダ `X-Remote-Test-Token` または `Authorization: Bearer`

## TiSLY App（PWA ダッシュボード）

4 画面ルーティング（デザイン準備中）:

| 画面 | パス |
|------|------|
| Home | `/tisly-app/home` |
| Devices | `/tisly-app/devices` |
| Events | `/tisly-app/events` |
| Settings | `/tisly-app/settings` |

## DB

SQLite（`TISLY_DB_PATH`）。全ログ（イベント・警報・操作・接続・障害）は TiSLY DB へ保存。

## 環境変数

`server/.env.example` に全項目のテンプレートあり。

## 本番デプロイ

- `deploy/systemd/` — systemd ユニット
- `deploy/nginx/tisly.jp.conf` — nginx
- [`docs/vps_production_deploy.md`](../docs/vps_production_deploy.md)
- [`docs/remote-test-phase2-deploy.md`](../docs/remote-test-phase2-deploy.md)

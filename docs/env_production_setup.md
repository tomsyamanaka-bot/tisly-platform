# 本番 .env 作成ガイド — tisly.jp（Phase 1501–1540）

VPS（`/opt/tisly/server`）に配置する `.env` の作成手順です。  
**本物のパスワード・トークン・秘密鍵はこのドキュメントに書かないでください。**

テンプレート: [`server/.env.production.example`](../server/.env.production.example)

---

## 1. ファイル作成

```bash
cd /opt/tisly/server
cp .env.production.example .env
chmod 600 .env
nano .env
```

---

## 2. 必須項目（初回公開）

| 変数 | 説明 | 生成・設定方法 |
|------|------|----------------|
| `NODE_ENV` | 本番モード | `production` |
| `JWT_SECRET` | API 認証署名鍵 | `openssl rand -hex 32` |
| `ADMIN_PASSWORD_HASH` | 管理者パスワード（scrypt） | `npm run hash:admin-password` で生成（下記） |
| `INGEST_SECRET` | デバイス ingest 認証 | `openssl rand -hex 24` |
| `TISLY_PUBLIC_URL` | 公開ベース URL | `https://tisly.jp` |
| `DEPLOY_OPS_TOKEN` | ロールバック API 用 | `openssl rand -hex 24` |
| `MQTT_MODE` | 初回は mock | `mock` |
| `MQTT_URL` | ブローカー（real 時） | 初回 mock なら空または `mqtt://127.0.0.1:1883` |
| `MQTT_SUBSCRIBER_ENABLED` | 購読ワーカー | 初回 `false` |
| `SHELLY_MODE` | Shelly 接続 | `mock` |
| `QNAP_UPLOAD_MODE` | 見積 PDF 保存 | `mock` |
| `GOOGLE_OAUTH_ENABLED` | Google 連携 | `false` |
| `GMAIL_SEND_MODE` | メール送信 | `mock` |
| `DEMO_RESET_ENABLED` | デモリセット cron | **`false`**（本番必須） |

### ADMIN_PASSWORD_HASH の生成

リポジトリの `server` ディレクトリで（**build 不要**）:

```bash
cd /opt/tisly/server
npm run hash:admin-password -- 'あなたの強力なパスワード'
```

出力行（`ADMIN_PASSWORD_HASH=scrypt:…`）を `.env` に貼り付け、**平文パスワードは .env に書かない**。

```bash
sudo systemctl restart tisly-server
```

### Gmail test-email 確認（SMTP 設定済みの場合）

```bash
TOKEN=$(curl -s -X POST https://tisly.jp/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"あなたの強力なパスワード"}' | jq -r .token)

curl -s -X POST https://tisly.jp/api/notifications/test-email \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## 3. 初回公開の mock 安全値（推奨固定）

営業デモ・初回 tisly.jp 公開では以下を維持します。

```env
TISLY_PUBLIC_URL=https://tisly.jp
MQTT_MODE=mock
MQTT_MOCK_MODE=true
MQTT_SUBSCRIBER_ENABLED=false
SHELLY_MODE=mock
QNAP_UPLOAD_MODE=mock
QNAP_MODE=mock
GMAIL_SEND_MODE=mock
GOOGLE_OAUTH_ENABLED=false
SWITCHBOT_MODE=mock
TISLY_DEMO_MODE=false
DEMO_RESET_ENABLED=false
```

参照: [`mock_real_modes.md`](./mock_real_modes.md)

---

## 4. サーバー基本設定

```env
PORT=3080
TISLY_PORT=3080
TISLY_HOST=0.0.0.0
DB_PROVIDER=sqlite
TISLY_DB_PATH=./data/tisly_notifications.db
RATE_LIMIT_PROVIDER=memory
ADMIN_USERNAME=admin
```

postgres 移行時は `docs/postgres_migration_runbook.md` を参照。

---

## 5. 設定後の確認

```bash
cd /opt/tisly/server
bash /opt/tisly/scripts/vps-first-deploy-check.sh
```

API からの確認（サーバー起動後）:

```bash
curl -s https://tisly.jp/api/deploy/preflight | jq '.ready, .missing'
```

`ready: true` かつ `missing: []` が理想です。

---

## 6. セキュリティ注意

- `.env` を git にコミットしない（`git status` で未追跡のみ）
- docs・README・issue に実値を貼らない
- `DEPLOY_OPS_TOKEN` はロールバック API のみに使用（`/app` Deploy Center）
- Mosquitto 1883 は `127.0.0.1` のみ（外部公開しない）

---

## 7. 関連ドキュメント

- VPS 手順: [`tisly_vps_deploy_step_by_step.md`](./tisly_vps_deploy_step_by_step.md)
- RC2 公開前: [`rc2_pre_deploy_checklist.md`](./rc2_pre_deploy_checklist.md)
- Release Gate: [`release_gate.md`](./release_gate.md)

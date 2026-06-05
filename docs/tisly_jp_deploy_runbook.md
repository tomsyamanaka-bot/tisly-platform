# tisly.jp 本番デプロイ Runbook（Phase 1241–1280）

ローカルで完成している TiSLY PWA を **ConoHa VPS + tisly.jp** で安全に公開する手順です。  
初めて VPS にデプロイする方でも、このドキュメントの順番どおりに進めれば公開できます。

> **今回のフェーズでは VPS への実デプロイは行いません。**  
> この Runbook と `server/deploy/` 配下のファイルが「デプロイ用の荷物」です。

## 前提

| 項目 | 推奨値 |
|------|--------|
| VPS | ConoHa VPS（Ubuntu 22.04 LTS） |
| ドメイン | `tisly.jp`（A レコード → VPS のグローバル IP） |
| 配置ディレクトリ | `/opt/tisly` |
| 実行ユーザー | `tisly`（専用ユーザー） |
| Node.js | 20 LTS |
| DB（初回） | `sqlite`（本番安定後 `postgres` 推奨） |

公開対象 URL（RC2）:

```
https://tisly.jp/app
https://tisly.jp/survey
https://tisly.jp/business
https://tisly.jp/sales
https://tisly.jp/customer/TOMS001
https://tisly.jp/customer/TOMS001/pro-remote
https://tisly.jp/customer/TOMS001/install/home
https://tisly.jp/tv/TOMS001
https://tisly.jp/deployment/checklist
```

---

## 1. VPS へログイン

```bash
ssh root@<VPSのIPアドレス>
# または
ssh tisly@<VPSのIPアドレス>
```

初回は root で入り、後述の `tisly` ユーザーを作成します。

---

## 2. 初期セットアップ（初回のみ）

```bash
sudo apt update && sudo apt upgrade -y
sudo adduser --disabled-password --gecos "" tisly
sudo mkdir -p /opt/tisly
sudo chown tisly:tisly /opt/tisly
```

---

## 3. Node.js / npm の確認

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential git
node -v    # v20.x であること
npm -v     # 10.x 前後
```

---

## 4. リポジトリ配置

```bash
sudo -u tisly git clone <リポジトリURL> /opt/tisly
cd /opt/tisly/server
```

更新時:

```bash
cd /opt/tisly
sudo -u tisly git pull
```

---

## 5. 依存インストールとビルド

```bash
cd /opt/tisly/server
sudo -u tisly npm ci
sudo -u tisly npm run build
sudo -u tisly npx tsc --noEmit
sudo -u tisly npm run test
sudo -u tisly npm run db:init
```

PWA アイコンが未生成の場合:

```bash
sudo -u tisly node scripts/gen-pwa-icons.mjs
```

---

## 6. `.env.production` の作成

テンプレートをコピーして編集します。**秘密情報は git にコミットしません。**

```bash
cd /opt/tisly/server
sudo -u tisly cp .env.production.example .env
sudo -u tisly nano .env
```

### 最低限設定する項目

| 変数 | 値の例 | 説明 |
|------|--------|------|
| `NODE_ENV` | `production` | 本番モード |
| `TISLY_PUBLIC_URL` | `https://tisly.jp` | 公開 URL（PWA manifest 等に使用） |
| `PORT` | `3080` | Node.js 待受ポート（nginx からプロキシ） |
| `DB_PROVIDER` | `sqlite` | 初回は sqlite |
| `JWT_SECRET` | `openssl rand -hex 32` の出力 | 管理 API 認証 |
| `ADMIN_PASSWORD_HASH` | hashPassword() の出力 | 管理者パスワード |
| `INGEST_SECRET` | `openssl rand -hex 24` の出力 | Node-RED ingest 共有秘密 |

### 初回公開は mock 維持（営業デモ安全）

| 変数 | 初回値 |
|------|--------|
| `TISLY_DEMO_MODE` | `false` |
| `DEMO_RESET_ENABLED` | `false` |
| `GMAIL_SEND_MODE` | `mock` |
| `QNAP_UPLOAD_MODE` | `mock` |
| `MQTT_MODE` | `mock` |
| `MQTT_MOCK_MODE` | `true` |
| `SHELLY_MODE` | `mock` |

real 接続用の変数は `.env.production.example` のコメントを参照。  
詳細: `docs/mock_real_modes.md`

### パスワード hash の生成

```bash
cd /opt/tisly/server
node -e "import('./dist/auth/password.js').then(m=>console.log(m.hashPassword('あなたのパスワード')))"
```

---

## 7. アプリの常駐起動

### 方法 A: systemd（推奨）

```bash
sudo cp /opt/tisly/server/deploy/systemd/tisly-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tisly-server
sudo systemctl start tisly-server
sudo systemctl status tisly-server
```

ログ確認:

```bash
journalctl -u tisly-server -f
```

### 方法 B: pm2（代替）

```bash
sudo npm install -g pm2
cd /opt/tisly/server
sudo -u tisly pm2 start dist/index.js --name tisly-server
sudo -u tisly pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u tisly --hp /home/tisly
```

---

## 8. Mosquitto（内部 MQTT・任意）

初回は `MQTT_MODE=mock` のため必須ではありません。real 切替時に設定します。

```bash
sudo apt install -y mosquitto mosquitto-clients
```

`/etc/mosquitto/conf.d/tisly.conf`:

```conf
listener 1883 127.0.0.1
allow_anonymous false
password_file /etc/mosquitto/passwd
```

```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd tisly_mqtt
sudo systemctl enable mosquitto
sudo systemctl restart mosquitto
```

**1883 を外部公開しないこと。**

---

## 9. nginx 設定

```bash
sudo apt install -y nginx
sudo cp /opt/tisly/server/deploy/nginx/tisly.jp.conf /etc/nginx/sites-available/tisly.jp
sudo ln -sf /etc/nginx/sites-available/tisly.jp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

テンプレート: `server/deploy/nginx/tisly.jp.conf`

- すべての PWA ルート（`/app` `/survey` `/business` `/sales` `/customer/` `/tv/` `/deployment/`）を **同一 Node.js アプリ** へプロキシ
- `/api/` REST API
- `/ws` WebSocket
- `/service-worker.js` · manifest 系 · `/icons/` — PWA インストール用

---

## 10. Let's Encrypt HTTPS 化

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tisly.jp -d www.tisly.jp
sudo certbot renew --dry-run
```

証明書パス（nginx テンプレート既定）:

- `/etc/letsencrypt/live/tisly.jp/fullchain.pem`
- `/etc/letsencrypt/live/tisly.jp/privkey.pem`

PWA は **HTTPS 必須** です。HTTP のみではホーム画面追加ができません。

---

## 11. 動作確認 URL 一覧

ブラウザまたは curl で確認:

| # | URL | 確認内容 |
|---|-----|----------|
| 1 | `https://tisly.jp/health` | JSON `status: ok` |
| 2 | `https://tisly.jp/api/health/full` | インフラヘルス |
| 3 | `https://tisly.jp/api/pwa/publish-audit` | PWA 公開監査 JSON |
| 4 | `https://tisly.jp/app` | App Hub + 本番公開チェックカード |
| 5 | `https://tisly.jp/manifest.webmanifest` | manifest 200（404 でないこと） |
| 6 | `https://tisly.jp/service-worker.js` | SW 200 |
| 7 | `https://tisly.jp/survey` | 現調 PWA |
| 8 | `https://tisly.jp/business` | TOMS Business |
| 9 | `https://tisly.jp/sales` | 営業デモ |
| 10 | `https://tisly.jp/customer/TOMS001/pro-remote` | PRO Remote |
| 11 | `https://tisly.jp/customer/TOMS001/install/home` | 施工 PWA（**リロードしても 404 にならないこと**） |
| 12 | `https://tisly.jp/tv/TOMS001` | Google TV Web |
| 13 | `https://tisly.jp/deployment/checklist` | 導入チェックリスト |

WebSocket:

```bash
# wss://tisly.jp/ws が接続できること（ブラウザ DevTools → Network → WS）
```

人手チェック: `docs/rc2_pre_deploy_checklist.md`

---

## 12. Rollback（ロールバック）手順

### アプリのみ戻す（最もよく使う）

```bash
cd /opt/tisly
sudo -u tisly git log --oneline -5
sudo -u tisly git checkout <安定していたcommit>
cd server
sudo -u tisly npm ci
sudo -u tisly npm run build
sudo systemctl restart tisly-server
# pm2 の場合: sudo -u tisly pm2 restart tisly-server
```

### DB も戻す（migrate 後に問題が出た場合）

```bash
cd /opt/tisly/server
sudo -u tisly npm run db:backup list
# バックアップから SQLite を data/ へ復元
sudo systemctl restart tisly-server
```

### nginx / SSL

通常はロールバック不要。アプリ層のみ戻せば十分です。

障害記録: `docs/security_incident_response.md`

---

## 13. デプロイ更新手順（2 回目以降）

```bash
cd /opt/tisly
sudo -u tisly git pull
cd server
sudo -u tisly npm ci
sudo -u tisly npm run build
sudo -u tisly npm run db:migrate   # スキーマ変更時のみ
sudo systemctl restart tisly-server
```

公開前: `docs/rc2_pre_deploy_checklist.md` を実施。

---

## 関連ファイル

| ファイル | 用途 |
|----------|------|
| `server/.env.production.example` | 本番 env テンプレート |
| `server/deploy/nginx/tisly.jp.conf` | nginx 設定 |
| `server/deploy/systemd/tisly-server.service` | systemd ユニット |
| `docs/rc2_pre_deploy_checklist.md` | 公開前人手チェック |
| `docs/production_routes.md` | URL 一覧 |
| `docs/mock_real_modes.md` | Mock/Real 切替 |
| `GET /api/pwa/publish-audit` | PWA 公開監査 API |

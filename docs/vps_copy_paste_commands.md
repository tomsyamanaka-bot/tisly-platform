# VPS コピペ用コマンド集 — 智紀さん向け

**Phase 1721–1760** · ConoHa VPS へ **https://tisly.jp** を初回公開するとき、上から順にブロックを貼り付けて実行してください。

> **秘密情報の実値はこのファイルに書きません。**  
> `JWT_SECRET` · `ADMIN_PASSWORD_HASH` · `INGEST_SECRET` · `DEPLOY_OPS_TOKEN` · MQTT 関連は **「✋ ここに入れる」** と明記した箇所だけ、ご自身の値を入力します。

関連:

- 手順の説明付き版 → [`vps_first_launch_for_tomonori.md`](./vps_first_launch_for_tomonori.md)
- `.env` の埋め方 → [`env_fill_in_guide.md`](./env_fill_in_guide.md)
- 公開後 URL チェック → [`production_url_checklist.md`](./production_url_checklist.md)
- 失敗時 → [`rollback_guide.md`](./rollback_guide.md)

---

## ブロック 1 — SSH 接続

```bash
ssh root@<VPSのIPアドレス>
```

**✋ ここに入れる:** `<VPSのIPアドレス>` を ConoHa コントロールパネルの IP に置き換えます。

---

## ブロック 2 — OS 更新と tisly ユーザー

```bash
apt update && apt upgrade -y
adduser --disabled-password --gecos "" tisly
mkdir -p /opt/tisly
chown tisly:tisly /opt/tisly
```

---

## ブロック 3 — Node.js 20 · nginx · certbot · git

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs build-essential git nginx certbot python3-certbot-nginx
node -v
npm -v
```

`node -v` が **v20.x** であることを確認してから次へ。

---

## ブロック 4 — git clone

```bash
sudo -u tisly git clone <リポジトリURL> /opt/tisly
cd /opt/tisly
ls -la server/public
```

**✋ ここに入れる:** `<リポジトリURL>` を GitHub の clone URL に置き換えます。

---

## ブロック 5 — .env ファイル作成

```bash
cd /opt/tisly/server
cp .env.production.example .env
chmod 600 .env
nano .env
```

`nano` で以下を設定します（詳細は [`env_fill_in_guide.md`](./env_fill_in_guide.md)）。

### コピペで OK（mock 安全値）

```env
NODE_ENV=production
TISLY_PUBLIC_URL=https://tisly.jp
PORT=3080
TISLY_PORT=3080
TISLY_HOST=0.0.0.0
DB_PROVIDER=sqlite
TISLY_DB_PATH=./data/tisly_notifications.db
RATE_LIMIT_PROVIDER=memory
ADMIN_USERNAME=admin
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

### ✋ ここに入れる（実値は各自生成・絶対に共有しない）

```env
JWT_SECRET=ここに入れる
ADMIN_PASSWORD_HASH=ここに入れる
INGEST_SECRET=ここに入れる
DEPLOY_OPS_TOKEN=ここに入れる
```

初回は MQTT は mock のまま（ブローカー未構築時）:

```env
MQTT_URL=
MQTT_USERNAME=
MQTT_PASSWORD=
```

real MQTT 接続時のみ（後日）:

```env
MQTT_URL=ここに入れる
MQTT_USERNAME=ここに入れる
MQTT_PASSWORD=ここに入れる
MQTT_SUBSCRIBER_ENABLED=true
MQTT_MOCK_MODE=false
```

保存: `Ctrl+O` → Enter → `Ctrl+X`

### 秘密値の生成コマンド（VPS で実行）

```bash
# JWT_SECRET
openssl rand -base64 48

# INGEST_SECRET（JWT と別値）
openssl rand -base64 48

# DEPLOY_OPS_TOKEN
openssl rand -hex 32
```

```bash
# ADMIN_PASSWORD_HASH（先に build が必要 — ブロック 7 の後でも可）
cd /opt/tisly/server
npm run build
node -e "
import { hashPassword } from './dist/auth/password.js';
console.log(hashPassword(process.argv[1]));
" 'あなたの強力なパスワード'
```

**✋ ここに入れる:** `'あなたの強力なパスワード'` を管理用の強力なパスワードに置き換えます。

---

## ブロック 6 — npm ci

```bash
cd /opt/tisly/server
sudo -u tisly npm ci
```

---

## ブロック 7 — npm run build

```bash
cd /opt/tisly/server
sudo -u tisly npm run build
test -f dist/index.js && echo "build OK"
```

---

## ブロック 8 — npm run release:gate

```bash
cd /opt/tisly/server
sudo -u tisly npm run release:gate
```

すべて合格するまで次に進みません。

---

## ブロック 9 — npm run db:init

```bash
cd /opt/tisly/server
sudo -u tisly npm run db:init
```

---

## ブロック 10 — systemd 登録

```bash
cp /opt/tisly/server/deploy/systemd/tisly-server.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable tisly-server
systemctl start tisly-server
systemctl status tisly-server
```

`active (running)` を確認:

```bash
journalctl -u tisly-server -n 50 --no-pager
```

---

## ブロック 11 — nginx 反映

```bash
cp /opt/tisly/server/deploy/nginx/tisly.jp.conf /etc/nginx/sites-available/tisly.jp
ln -sf /etc/nginx/sites-available/tisly.jp /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

---

## ブロック 12 — certbot SSL

```bash
certbot --nginx -d tisly.jp -d www.tisly.jp
```

**✋ ここに入れる:**

- メールアドレス
- 利用規約への同意（Y）
- HTTPS リダイレクトは **2（Redirect）** を推奨

更新テスト:

```bash
certbot renew --dry-run
```

---

## ブロック 13 — 投入前チェック（必須）

```bash
cd /opt/tisly
bash scripts/vps-first-deploy-check.sh
```

**READY FOR DEPLOY** と表示されるまで ✗ を解消します。

---

## ブロック 14 — https://tisly.jp/app 確認

```bash
curl -sI https://tisly.jp/app | head -5
curl -sS https://tisly.jp/api/health
curl -sS https://tisly.jp/api/deploy/preflight | head -c 400
```

ブラウザで `https://tisly.jp/app` を開き、App Hub が表示されることを確認します。

全 URL のチェック表 → [`production_url_checklist.md`](./production_url_checklist.md)

---

## ブロック 15 — 更新時（2回目以降）

```bash
cd /opt/tisly
bash scripts/vps-deploy-one-command.sh
```

---

## ブロック 16 — ロールバック（問題が出たとき）

```bash
cd /opt/tisly
bash scripts/rollback.sh
```

詳細 → [`rollback_guide.md`](./rollback_guide.md)

---

## 必須 env 一覧（チェック用）

| 変数 | 初回 | 備考 |
|------|------|------|
| `NODE_ENV` | `production` | |
| `TISLY_PUBLIC_URL` | `https://tisly.jp` | |
| `JWT_SECRET` | ✋ ここに入れる | `openssl rand -base64 48` |
| `ADMIN_PASSWORD_HASH` | ✋ ここに入れる | `hashPassword()` |
| `INGEST_SECRET` | ✋ ここに入れる | JWT と別値 |
| `DEPLOY_OPS_TOKEN` | ✋ ここに入れる | `openssl rand -hex 32` |
| `MQTT_MODE` | `mock` | 初回 |
| `MQTT_SUBSCRIBER_ENABLED` | `false` | 初回 |
| `MQTT_URL` / `MQTT_USERNAME` / `MQTT_PASSWORD` | 空 or ✋ ここに入れる | real 時のみ |
| `SHELLY_MODE` | `mock` | |
| `QNAP_UPLOAD_MODE` | `mock` | |
| `GMAIL_SEND_MODE` | `mock` | |
| `GOOGLE_OAUTH_ENABLED` | `false` | |
| `DEMO_RESET_ENABLED` | `false` | |

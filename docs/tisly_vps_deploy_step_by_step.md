# TiSLY VPS デプロイ手順 — 超初心者向け（Phase 1381–1400）

ConoHa VPS に TiSLY を **コピペだけ** で公開する手順です。  
対象ドメイン: **https://tisly.jp**

> 各ブロックを上から順に、そのままターミナルに貼り付けて実行してください。

---

## 0. 事前準備（お手持ちの PC）

- ConoHa VPS の IP アドレス
- `tisly.jp` の A レコード → VPS の IP
- Git リポジトリ URL（または ZIP でアップロード）

---

## 1. ConoHa VPS にログイン

```bash
ssh root@<VPSのIPアドレス>
```

パスワードまたは SSH キーでログインします。

---

## 2. 初回セットアップ（Ubuntu）

```bash
apt update && apt upgrade -y
adduser --disabled-password --gecos "" tisly
mkdir -p /opt/tisly
chown tisly:tisly /opt/tisly
```

---

## 3. Node.js 20 インストール

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs build-essential git nginx certbot python3-certbot-nginx
node -v
npm -v
```

`node -v` が `v20.x` であることを確認。

---

## 4. git clone

```bash
sudo -u tisly git clone <リポジトリURL> /opt/tisly
cd /opt/tisly/server
```

更新時:

```bash
cd /opt/tisly
sudo -u tisly git pull
cd server
```

---

## 5. 本番 .env 作成

```bash
cd /opt/tisly/server
cp .env.production.example .env
nano .env
```

**必ず設定する項目:**

```env
NODE_ENV=production
TISLY_PUBLIC_URL=https://tisly.jp
JWT_SECRET=<openssl rand -hex 32 の結果>
ADMIN_PASSWORD_HASH=<node で bcrypt ハッシュ>
MQTT_URL=mqtt://127.0.0.1:1883
MQTT_USERNAME=tisly_mqtt
MQTT_PASSWORD=<任意の強力なパスワード>
```

保存: `Ctrl+O` → Enter → `Ctrl+X`

JWT 生成例:

```bash
openssl rand -hex 32
```

---

## 6. npm install

```bash
cd /opt/tisly/server
sudo -u tisly npm ci
```

`package-lock.json` がない場合:

```bash
sudo -u tisly npm install
```

---

## 7. build

```bash
cd /opt/tisly/server
sudo -u tisly npm run build
```

`dist/index.js` ができれば OK。

---

## 8. PWA アイコン（未生成の場合）

```bash
cd /opt/tisly/server
sudo -u tisly node scripts/gen-pwa-icons.mjs
```

---

## 9. DB 初期化

```bash
cd /opt/tisly/server
sudo -u tisly npm run db:init
```

---

## 10. systemd サービス登録

```bash
cp /opt/tisly/server/deploy/systemd/tisly-server.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable tisly-server
systemctl start tisly-server
systemctl status tisly-server
```

`active (running)` になれば OK。ログ確認:

```bash
journalctl -u tisly-server -f
```

---

## 11. nginx 設定

```bash
cp /opt/tisly/server/deploy/nginx/tisly.jp.conf /etc/nginx/sites-available/tisly.jp
ln -sf /etc/nginx/sites-available/tisly.jp /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

---

## 12. certbot（Let's Encrypt）

```bash
certbot --nginx -d tisly.jp -d www.tisly.jp
```

メールアドレス入力 → 利用規約同意 → HTTPS リダイレクトは **2（Redirect）** 推奨。

更新テスト:

```bash
certbot renew --dry-run
```

---

## 13. 公開確認

```bash
curl -s https://tisly.jp/health
curl -sI https://tisly.jp/app | head -5
curl -sI https://tisly.jp/survey | head -5
```

ブラウザで以下を開く:

```
https://tisly.jp/app
https://tisly.jp/survey
https://tisly.jp/business
https://tisly.jp/customer/TOMS001
https://tisly.jp/customer/TOMS001/install/home
https://tisly.jp/customer/TOMS001/pro-remote
https://tisly.jp/deployment/checklist
```

`/app` の **Production Readiness** がすべて緑で「公開可能」ならデプロイ完了です。

---

## 14. Release Gate（開発マシンで事前確認）

VPS 投入前にローカルで:

```bash
cd server
npm run release:gate
```

build → tsc → test → dry-run がすべて合格すること。

---

## トラブルシュート

| 症状 | 対処 |
|------|------|
| 502 Bad Gateway | `systemctl status tisly-server` — Node が起動しているか |
| PWA インストール不可 | `https://tisly.jp/icons/icon-192.png` が 200 か確認 |
| WebSocket 切断 | nginx の `/ws` ブロックと `wss://tisly.jp/ws` |
| 証明書エラー | `certbot certificates` で期限確認 |

---

## 関連ドキュメント

- nginx 詳細: [`nginx_tisly_production.md`](./nginx_tisly_production.md)
- URL 一覧: [`production_routes.md`](./production_routes.md)
- RC2 チェックリスト: [`rc2_pre_deploy_checklist.md`](./rc2_pre_deploy_checklist.md)

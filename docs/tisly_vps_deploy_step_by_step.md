# TiSLY VPS デプロイ手順 — 超初心者向け（Phase 1501–1540）

ConoHa VPS に TiSLY を **コピペだけ** で公開する手順です。  
対象ドメイン: **https://tisly.jp**

> 各ブロックを上から順に、そのままターミナルに貼り付けて実行してください。

**Phase 1501 追加スクリプト（投入支援）:**

| スクリプト | 用途 |
|------------|------|
| `scripts/vps-first-deploy-check.sh` | 初回投入前の環境・.env・build・nginx・port・HTTPS 確認 |
| `scripts/vps-deploy-one-command.sh` | git pull → build → release:gate → restart → URL 確認を一本化 |

`.env` 詳細: [`env_production_setup.md`](./env_production_setup.md)

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
chmod 600 .env
nano .env
```

必須項目の一覧・生成方法は **[`env_production_setup.md`](./env_production_setup.md)** を参照（秘密値は docs に書かない）。

初回公開の最低限（値の生成方法は [`env_production_setup.md`](./env_production_setup.md)）:

- `NODE_ENV` → `production`
- `TISLY_PUBLIC_URL` → `https://tisly.jp`
- `JWT_SECRET` → `openssl rand -hex 32`
- `ADMIN_PASSWORD_HASH` → `hashPassword()` で生成
- `INGEST_SECRET` / `DEPLOY_OPS_TOKEN` → `openssl rand -hex 24`
- `MQTT_MODE` → `mock` · `MQTT_SUBSCRIBER_ENABLED` → `false`
- `SHELLY_MODE` / `QNAP_UPLOAD_MODE` / `GMAIL_SEND_MODE` → `mock`
- `GOOGLE_OAUTH_ENABLED` → `false` · `DEMO_RESET_ENABLED` → `false`

保存: `Ctrl+O` → Enter → `Ctrl+X`

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

## 13. 初回投入チェック（Phase 1501）

```bash
cd /opt/tisly
bash scripts/vps-first-deploy-check.sh
```

`判定: READY FOR DEPLOY` になるまで ✗ を解消します。

---

## 14. 一本化デプロイ（更新時・初回 build 後）

```bash
cd /opt/tisly
bash scripts/vps-deploy-one-command.sh
```

流れ: `git pull` → `npm ci` → `build` → `release:gate` → `db:init` → `systemctl restart` → `nginx reload` → URL 確認

---

## 15. 公開確認

```bash
curl -s https://tisly.jp/api/health
curl -sI https://tisly.jp/app | head -5
curl -sI https://tisly.jp/survey | head -5
```

ブラウザで **本番公開チェックリスト** を開く:

```
https://tisly.jp/deployment/checklist
```

9 URL・API health・Release Gate・nginx/systemd・PWA installReady・実機確認項目が一覧表示されます。

本番 URL 9 件:

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

`/app` の **Production Readiness** がすべて緑で「公開可能」ならデプロイ完了です。

---

## 16. Release Gate（開発マシンで事前確認）

VPS 投入前にローカルで:

```bash
cd server
npm run release:gate
```

build → tsc → test → dry-run がすべて合格すること。

---

## 失敗時の戻し方（ロールバック）

```bash
# 前回コミットへ戻す（VPS）
cd /opt/tisly
bash scripts/rollback.sh
sudo systemctl restart tisly-server
sudo nginx -t && sudo systemctl reload nginx
```

または `/app` Deploy Center からロールバック（`DEPLOY_OPS_TOKEN` 必要）。

---

## トラブルシュート

| 症状 | 対処 |
|------|------|
| 502 Bad Gateway | `systemctl status tisly-server` — Node が起動しているか |
| vps-first-deploy-check FAIL | 出力の ✗ 行を順に解消 |
| PWA インストール不可 | `https://tisly.jp/icons/icon-192.png` が 200 か確認 |
| WebSocket 切断 | nginx の `/ws` ブロックと `wss://tisly.jp/ws` |
| 証明書エラー | `certbot certificates` で期限確認 |

---

## 関連ドキュメント

- nginx 詳細: [`nginx_tisly_production.md`](./nginx_tisly_production.md)
- URL 一覧: [`production_routes.md`](./production_routes.md)
- RC2 チェックリスト: [`rc2_pre_deploy_checklist.md`](./rc2_pre_deploy_checklist.md)
- .env 本番ガイド: [`env_production_setup.md`](./env_production_setup.md)

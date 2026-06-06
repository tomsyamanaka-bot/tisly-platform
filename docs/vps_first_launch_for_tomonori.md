# TiSLY 本番初回公開 — 智紀さん向け VPS 手順書

**Phase 1721–1760 — VPS Deploy Final Safety Check & Launch Guide**  
ConoHa VPS へ **https://tisly.jp** の PWA 群を公開するための手順書です。本番アプリは **`/opt/tisly/server`**（`server/public` 内包）を標準とします。

> 上から順にブロックをターミナルへ貼り付けて実行してください。  
> **「✋ 智紀さんが入力」** と書いてある箇所だけ、ご自身の値を入れます。

関連:

- **コピペだけで進めたいとき** → [`vps_copy_paste_commands.md`](./vps_copy_paste_commands.md)（上からブロック順に貼り付け）
- `.env` の値の作り方 → [`env_fill_in_guide.md`](./env_fill_in_guide.md)
- 公開後 URL チェック表 → [`production_url_checklist.md`](./production_url_checklist.md)
- 公開後の curl 確認 → [`production_check_commands.md`](./production_check_commands.md)
- 失敗時の戻し方 → [`rollback_guide.md`](./rollback_guide.md)

---

## 0. 事前に用意するもの（お手持ちの PC）

| 項目 | 説明 |
|------|------|
| VPS の IP | ConoHa コントロールパネルで確認 |
| SSH ログイン | `root@<IP>` または `tisly@<IP>` |
| ドメイン | `tisly.jp` の A レコード → VPS の IP |
| Git URL | リポジトリの clone URL |

---

## 1. ConoHa VPS に SSH 接続

```bash
ssh root@<VPSのIPアドレス>
```

**✋ 智紀さんが入力:** `<VPSのIPアドレス>` を ConoHa の IP に置き換えます。

ログインできたら次へ。

---

## 2. 初回セットアップ（Ubuntu・root で実行）

```bash
apt update && apt upgrade -y
adduser --disabled-password --gecos "" tisly
mkdir -p /opt/tisly
chown tisly:tisly /opt/tisly
```

---

## 3. Node.js 20 · nginx · certbot · git

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs build-essential git nginx certbot python3-certbot-nginx
node -v
npm -v
```

`node -v` が **v20.x** なら OK。

---

## 4. `/opt/tisly` 作成と git clone

```bash
sudo -u tisly git clone <リポジトリURL> /opt/tisly
cd /opt/tisly
ls -la
```

**✋ 智紀さんが入力:** `<リポジトリURL>` を実際の Git URL に置き換えます。

更新時（2回目以降）:

```bash
cd /opt/tisly
sudo -u tisly git pull
```

---

## 5. `.env` 作成

```bash
cd /opt/tisly/server
cp .env.production.example .env
chmod 600 .env
nano .env
```

**✋ 智紀さんが入力:** `nano` で必須項目を埋めます。  
生成コマンドと手順は **[`env_fill_in_guide.md`](./env_fill_in_guide.md)** を見ながら進めてください。

最低限そろえる項目:

- `NODE_ENV=production`
- `TISLY_PUBLIC_URL=https://tisly.jp`
- `JWT_SECRET`（openssl で生成）
- `ADMIN_PASSWORD_HASH`（hashPassword で生成）
- `INGEST_SECRET`（openssl で生成）
- `DEPLOY_OPS_TOKEN`（openssl で生成）
- `MQTT_MODE=mock` · `MQTT_SUBSCRIBER_ENABLED=false`
- `SHELLY_MODE=mock` · `QNAP_UPLOAD_MODE=mock` · `GMAIL_SEND_MODE=mock`
- `GOOGLE_OAUTH_ENABLED=false` · `DEMO_RESET_ENABLED=false`

保存: `Ctrl+O` → Enter → `Ctrl+X`

---

## 6. npm ci

```bash
cd /opt/tisly/server
sudo -u tisly npm ci
```

---

## 7. npm run build

```bash
cd /opt/tisly/server
sudo -u tisly npm run build
```

`dist/index.js` ができれば OK。

---

## 8. npm run release:gate

```bash
cd /opt/tisly/server
sudo -u tisly npm run release:gate
```

すべて合格するまで次に進みません（build · tsc · test · dry-run）。

---

## 9. npm run db:init

```bash
cd /opt/tisly/server
sudo -u tisly npm run db:init
```

---

## 10. systemd 登録

```bash
cp /opt/tisly/server/deploy/systemd/tisly-server.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable tisly-server
systemctl start tisly-server
systemctl status tisly-server
```

`active (running)` になれば OK。ログ:

```bash
journalctl -u tisly-server -n 50 --no-pager
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

**✋ 智紀さんが入力:**

- メールアドレス
- 利用規約への同意（Y）
- HTTPS リダイレクトは **2（Redirect）** を推奨

更新テスト:

```bash
certbot renew --dry-run
```

---

## 13. 投入前チェック（必須）

```bash
cd /opt/tisly
bash scripts/vps-first-deploy-check.sh
```

最後に **READY FOR DEPLOY** と表示されるまで ✗ を解消します。  
**NOT READY** のときは表示される「次にやること」に従ってください。

---

## 14. 一本化デプロイ（更新時も同じ）

```bash
cd /opt/tisly
bash scripts/vps-deploy-one-command.sh
```

流れ: `git pull` → `npm ci` → `build` → `release:gate` → `db:init` → `restart` → `nginx reload` → URL 確認

---

## 15. 公開確認（9 URL）

まずブラウザで **https://tisly.jp/app** を開き、App Hub が表示されることを確認します。

チェック表（表示 OK · PWA · API · 404/500 · 各端末）→ **[`production_url_checklist.md`](./production_url_checklist.md)**

9 本番 URL:

| # | URL |
|---|-----|
| 1 | https://tisly.jp/app |
| 2 | https://tisly.jp/survey |
| 3 | https://tisly.jp/business |
| 4 | https://tisly.jp/sales |
| 5 | https://tisly.jp/customer/TOMS001 |
| 6 | https://tisly.jp/customer/TOMS001/pro-remote |
| 7 | https://tisly.jp/customer/TOMS001/install/home |
| 8 | https://tisly.jp/tv/TOMS001 |
| 9 | https://tisly.jp/deployment/checklist |

ターミナルでも確認できます → [`production_check_commands.md`](./production_check_commands.md)

---

## 16. iPhone で PWA 追加確認

1. iPhone の **Safari** で `https://tisly.jp/survey` を開く
2. 共有ボタン → **ホーム画面に追加**
3. ホーム画面のアイコンから起動 → アドレスバーなし（standalone）なら OK
4. `https://tisly.jp/deployment/checklist` の「iPhone Safari 確認項目」にチェックを入れる

---

## 失敗したとき

```bash
cd /opt/tisly
bash scripts/rollback.sh
```

詳細 → [`rollback_guide.md`](./rollback_guide.md)

---

## トラブルシュート

| 症状 | 対処 |
|------|------|
| 502 Bad Gateway | `systemctl status tisly-server` · `journalctl -u tisly-server -n 50` |
| vps-first-deploy-check が NOT READY | 赤い ✗ と「次にやること」を順に実施 |
| 証明書エラー | `certbot certificates` |
| PWA 追加できない | `https://tisly.jp/icons/icon-192.png` が 200 か確認 |

---

## 関連ドキュメント

- nginx 詳細: [`nginx_tisly_production.md`](./nginx_tisly_production.md)
- URL 一覧: [`production_routes.md`](./production_routes.md)
- RC2 チェック: [`rc2_pre_deploy_checklist.md`](./rc2_pre_deploy_checklist.md)

# VPS 本番起動コマンド確定版 — 智紀さん向け

**Phase 1841–1880 — VPS Production Launch（本番起動コマンド確定版）**

> 最新の A–F 手順: [`vps_phase1841_launch.md`](./vps_phase1841_launch.md)

> VNC コンソールから貼り付けて実行します。SSH 不要。秘密値は表示しません。

関連: [`env_fill_in_guide.md`](./env_fill_in_guide.md) · [`vps_copy_paste_commands.md`](./vps_copy_paste_commands.md) · Web UI `/deployment/checklist`

---

## 起動方式の結論

| 項目 | 値 |
|------|-----|
| **推奨** | **systemd**（`tisly-server.service`） |
| PM2 | 代替のみ（本番では使わない） |
| package.json | `/opt/tisly/server/package.json` |
| start script | `npm start` → `node dist/index.js` |
| entry point | `/opt/tisly/server/dist/index.js` |
| ポート | `3080`（nginx → `127.0.0.1:3080`） |

---

## .env テンプレートの場所

| パス | 役割 |
|------|------|
| **`/opt/tisly/server/.env.production.example`** | **正式テンプレート**（ここから `cp`） |
| `/opt/tisly/.env.production.example` | 参照用ポインタ（ルート） |
| `/opt/tisly/server/.env` | 本番実ファイル（git 管理外） |

---

## nginx / systemd の配置先

```bash
# systemd
cp /opt/tisly/server/deploy/systemd/tisly-server.service /etc/systemd/system/tisly-server.service

# nginx
cp /opt/tisly/server/deploy/nginx/tisly.jp.conf /etc/nginx/sites-available/tisly.jp
ln -sf /etc/nginx/sites-available/tisly.jp /etc/nginx/sites-enabled/tisly.jp
```

---

## 方法 A — スクリプト（推奨 · .env 完了後）

```bash
cd /opt/tisly
bash scripts/vps-production-start.sh
```

`.env` 未完了の場合は先に [`vps_phase1841_launch.md`](./vps_phase1841_launch.md) の **B-1** を実行してください。

---

## 方法 B — 1 ブロック手動（VNC コピペ）

```bash
cd /opt/tisly/server
test -f .env || cp .env.production.example .env && chmod 600 .env
test -f .env && grep -qE '^JWT_SECRET=.+$' .env && grep -qE '^ADMIN_PASSWORD_HASH=.+$' .env || { echo '✋ .env 未完了 — docs/env_fill_in_guide.md を参照'; exit 1; }
npm ci
npm run build
npm run release:gate
npm run db:init
cp deploy/systemd/tisly-server.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable tisly-server
systemctl restart tisly-server
systemctl is-active tisly-server
cp deploy/nginx/tisly.jp.conf /etc/nginx/sites-available/tisly.jp
ln -sf /etc/nginx/sites-available/tisly.jp /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
curl -sS http://127.0.0.1:3080/api/health
curl -sI https://tisly.jp/app | head -5
curl -sS https://tisly.jp/api/health
```

SSL 未設定の場合は別途:

```bash
certbot --nginx -d tisly.jp -d www.tisly.jp
```

---

## 成功時の表示

- `systemctl is-active tisly-server` → `active`
- `curl http://127.0.0.1:3080/api/health` → `{"ok":true,...}`
- `nginx -t` → `syntax is ok`
- `/deployment/checklist` で **VPS DEPLOYED** が緑

---

## 失敗時のログ

```bash
journalctl -u tisly-server -n 80 --no-pager
systemctl status tisly-server
nginx -t
ss -tlnp | grep 3080
```

---

## 確認 URL

- https://tisly.jp/app
- https://tisly.jp/survey
- https://tisly.jp/business
- https://tisly.jp/sales
- https://tisly.jp/deployment/checklist
- https://tisly.jp/api/health

---

## ✋ 智紀さんが入力する .env 項目

| 変数 | 生成方法 |
|------|----------|
| `JWT_SECRET` | `openssl rand -base64 48` |
| `INGEST_SECRET` | `openssl rand -base64 48`（JWT と別値） |
| `DEPLOY_OPS_TOKEN` | `openssl rand -hex 32` |
| `ADMIN_PASSWORD_HASH` | `hashPassword('強力なパスワード')` — build 後 |

詳細手順: [`env_fill_in_guide.md`](./env_fill_in_guide.md)

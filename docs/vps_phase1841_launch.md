# Phase 1841–1880 — VPS Production Launch Support & Env Final Check

**智紀さん向け · tisly.jp 本番公開の最終手順**

> VNC コンソールから実行。秘密値はチャット・スクショに載せない。  
> 関連: [`env_fill_in_guide.md`](./env_fill_in_guide.md) · [`vps_production_start.md`](./vps_production_start.md) · Web UI `/deployment/checklist`

---

## A. 智紀が今やること

1. ConoHa VNC コンソールで **root** ログイン（`/opt/tisly` は clone 済み）
2. **B-1** の .env 準備ブロックで秘密を生成し、`nano .env` に貼り付け
3. **B-2** の本番起動を 1 回実行: `bash scripts/vps-production-start.sh`
4. **B-3** の確認コマンドを実行
5. HTTPS が未設定なら **certbot** を実行
6. ブラウザで **https://tisly.jp/app** を開く

---

## B. VPSに貼るコマンド

### B-1 — .env 準備（秘密生成 · プレースホルダのみ）

```bash
cd /opt/tisly/server
test -f .env || cp .env.production.example .env && chmod 600 .env

# JWT_SECRET（出力を .env の JWT_SECRET= に貼り付け）
openssl rand -base64 48

# INGEST_SECRET（JWT と別値）
openssl rand -base64 48

# DEPLOY_OPS_TOKEN
openssl rand -hex 32

# ADMIN_PASSWORD_HASH（build 後 · 'YOUR_STRONG_PASSWORD' を自分の強力なパスワードに置換）
npm run build
node -e "import { hashPassword } from './dist/auth/password.js'; console.log(hashPassword(process.argv[1]));" 'YOUR_STRONG_PASSWORD'

nano .env
# 必須: JWT_SECRET · ADMIN_PASSWORD_HASH · INGEST_SECRET · DEPLOY_OPS_TOKEN
#       NODE_ENV=production · TISLY_PUBLIC_URL=https://tisly.jp
```

### B-2 — 本番起動（.env 完了後 · 1 ブロック）

```bash
cd /opt/tisly
bash scripts/vps-production-start.sh
```

スクリプトが自動実行: `npm ci` · `build` · `release:gate` · `db:init` · systemd · nginx · localhost health

### B-3 — 起動後確認

```bash
systemctl status tisly-server
journalctl -u tisly-server -n 80 --no-pager
nginx -t
curl -s http://127.0.0.1:3080/api/health
curl -I https://tisly.jp/app
```

### B-4 — SSL 未設定時のみ

```bash
certbot --nginx -d tisly.jp -d www.tisly.jp
```

---

## C. .env入力例

実値は書きません。`nano .env` で以下を参考に入力してください。

```env
# --- 必須（✋ 智紀さんが入力） ---
NODE_ENV=production
TISLY_PUBLIC_URL=https://tisly.jp

# JWT_SECRET ← openssl rand -base64 48
JWT_SECRET=ここに入れる
# ADMIN_PASSWORD_HASH ← hashPassword（scrypt:... 形式）
ADMIN_PASSWORD_HASH=ここに入れる
# INGEST_SECRET ← openssl rand -base64 48（JWT と別値）
INGEST_SECRET=ここに入れる
# DEPLOY_OPS_TOKEN ← openssl rand -hex 32
DEPLOY_OPS_TOKEN=ここに入れる

# --- 初回公開は mock 安全値（テンプレのまま可） ---
PORT=3080
TISLY_PORT=3080
DB_PROVIDER=sqlite
MQTT_MODE=mock
MQTT_MOCK_MODE=true
SHELLY_MODE=mock
QNAP_MODE=mock
GMAIL_SEND_MODE=mock
DEMO_RESET_ENABLED=false
ADMIN_USERNAME=admin
```

| 変数 | 生成コマンド |
|------|-------------|
| `JWT_SECRET` | `openssl rand -base64 48` |
| `INGEST_SECRET` | `openssl rand -base64 48`（JWT と別値） |
| `DEPLOY_OPS_TOKEN` | `openssl rand -hex 32` |
| `ADMIN_PASSWORD_HASH` | build 後 `hashPassword('強力なパスワード')` |

---

## D. 成功時の表示

| 確認 | 期待される結果 |
|------|----------------|
| `systemctl is-active tisly-server` | `active` |
| `curl -s http://127.0.0.1:3080/api/health` | `{"ok":true,...}` |
| `nginx -t` | `syntax is ok` · `test is successful` |
| `curl -I https://tisly.jp/app` | `HTTP/2 200` または `304` |
| `/deployment/checklist` | **VPS DEPLOYED** · PWA installReady が緑 |

---

## E. 失敗時の見る場所

| 症状 | 原因 | 確認コマンド | 対処 |
|------|------|-------------|------|
| スクリプトが .env 不足で exit 1 | 必須キーが空 | `bash scripts/vps-first-deploy-check.sh` | B-1 をやり直し → B-2 再実行 |
| `curl 127.0.0.1:3080` 失敗 | Node 未起動 · build 失敗 | `journalctl -u tisly-server -n 80` · `ss -tlnp \| grep 3080` | ログ修正 → `npm run build` → `systemctl restart tisly-server` |
| `nginx -t` エラー | 設定破損 · 競合 | `nginx -t` · `ls /etc/nginx/sites-enabled/` | `cp server/deploy/nginx/tisly.jp.conf` → `nginx -t` → reload |
| `https://tisly.jp` 接続不可 | certbot 未実施 | `certbot certificates` | B-4 を実行 |
| 502 Bad Gateway | upstream (3080) 停止 | `systemctl is-active tisly-server` · `curl 127.0.0.1:3080/api/health` | `systemctl restart tisly-server` |

共通ログ:

```bash
journalctl -u tisly-server -n 80 --no-pager
systemctl status tisly-server
nginx -t
```

---

## F. 次に開くURL

1. **https://tisly.jp/app** — App Hub（PWA 本番入口）
2. **https://tisly.jp/survey** — 現調 PWA
3. **https://tisly.jp/business** — TOMS Business
4. **https://tisly.jp/sales** — 営業デモ
5. **https://tisly.jp/deployment/checklist** — 本番公開チェックリスト
6. **https://tisly.jp/api/health** — API ヘルス

# .env 作成ウィザード — 智紀さん向け

**Phase 1541–1580** · `/opt/tisly/server/.env` を安全に埋める手順です。

> **本物の JWT・パスワード・トークンはこのドキュメントにも .env.example にも書きません。**  
> 生成した値は `.env` にだけ貼り付け、チャット・issue・スクリーンショットに載せないでください。

テンプレート: [`server/.env.production.example`](../server/.env.production.example)

---

## ステップ 0 — ファイルを作る

```bash
cd /opt/tisly/server
cp .env.production.example .env
chmod 600 .env
```

---

## ステップ 1 — 基本（コピペで OK）

`.env` を `nano .env` で開き、以下をそのまま設定します。

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
```

初回公開は **mock 安全値** を維持します（[`mock_real_modes.md`](./mock_real_modes.md) 参照）:

```env
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

---

## ステップ 2 — JWT_SECRET（必須）

**何に使うか:** API の JWT 署名鍵。漏洩するとセッション偽造の危険があります。

**生成（VPS で実行）:**

```bash
openssl rand -base64 48
```

出力された 1 行をコピーし、`.env` に:

```env
JWT_SECRET=ここに貼り付け
```

**✋ 智紀さんが入力:** 上記コマンドの出力のみを使います。サンプル値は使わないでください。

---

## ステップ 3 — INGEST_SECRET（必須）

**何に使うか:** デバイスからの ingest API 認証。

**生成:**

```bash
openssl rand -base64 48
```

```env
INGEST_SECRET=ここに貼り付け
```

別の値を JWT_SECRET と **必ず別** にしてください。

---

## ステップ 4 — DEPLOY_OPS_TOKEN（必須）

**何に使うか:** Deploy Center / ロールバック API（`X-Deploy-Ops-Token` ヘッダー）。

**生成:**

```bash
openssl rand -hex 32
```

```env
DEPLOY_OPS_TOKEN=ここに貼り付け
```

この値は `/app` のロールバック操作にも使います。他人に共有しないでください。

---

## ステップ 5 — ADMIN_PASSWORD_HASH（必須）

**何に使うか:** 管理画面ログイン用。**平文パスワードは .env に書きません。**

### 5-a. まず build 済みであること

```bash
cd /opt/tisly/server
npm run build
```

### 5-b. ハッシュ生成

**✋ 智紀さんが入力:** `'あなたの強力なパスワード'` を自分だけが知る強力なパスワードに置き換えます。

```bash
cd /opt/tisly/server
node -e "
import { hashPassword } from './dist/auth/password.js';
console.log(hashPassword(process.argv[1]));
" 'あなたの強力なパスワード'
```

出力（`$2b$...` で始まる長い文字列）を `.env` に:

```env
ADMIN_PASSWORD_HASH=ここに貼り付け
```

**注意:** シングルクォート内のパスワードはシェル履歴に残る場合があります。作業後 `history -c` するか、対話式で別途検討してください。

---

## ステップ 6 — 確認

```bash
cd /opt/tisly
bash scripts/vps-first-deploy-check.sh
```

`.env` の不足があれば赤文字で一覧表示されます。

API 確認（サーバー起動後）:

```bash
curl -s https://tisly.jp/api/deploy/preflight | head -c 500
```

`ready: true` かつ `missing: []` が理想です。

---

## チェックリスト（貼り付け前に確認）

| 変数 | 生成方法 | 済 |
|------|----------|-----|
| `JWT_SECRET` | `openssl rand -base64 48` | ☐ |
| `INGEST_SECRET` | `openssl rand -base64 48`（JWT と別値） | ☐ |
| `DEPLOY_OPS_TOKEN` | `openssl rand -hex 32` | ☐ |
| `ADMIN_PASSWORD_HASH` | `hashPassword()` | ☐ |
| `TISLY_PUBLIC_URL` | `https://tisly.jp` 固定 | ☐ |
| mock 群 | 上記ステップ 1 のとおり | ☐ |
| `DEMO_RESET_ENABLED` | **`false`** | ☐ |

---

## やってはいけないこと

- `.env` を git commit しない
- docs・README・Slack に実値を貼らない
- サンプル値 `change-me` のまま本番投入しない
- `DEMO_RESET_ENABLED=true` のまま顧客デモを公開しない

---

## 次のステップ

`.env` 完了後 → [`vps_first_launch_for_tomonori.md`](./vps_first_launch_for_tomonori.md) の **ステップ 6** 以降へ。

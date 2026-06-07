# 管理者パスワード復旧 — tisly.jp（Phase 2381）

本番 VPS で `ADMIN_PASSWORD_HASH=temp` のまま、または admin ログイン / Gmail test-email が失敗する場合の復旧手順です。  
**平文パスワードは .env に書きません。**

関連: [`env_fill_in_guide.md`](./env_fill_in_guide.md) · [`env_production_setup.md`](./env_production_setup.md)

---

## 1. ハッシュ生成

`/opt/tisly/server` で（**build 不要**）:

```bash
cd /opt/tisly/server
npm run hash:admin-password -- 'あなたの強力なパスワード'
```

**✋ 智紀さんが入力:** `'あなたの強力なパスワード'` を自分だけが知る強力なパスワード（8 文字以上）に置き換えます。

出力例:

```text
ADMIN_PASSWORD_HASH=scrypt:xxxxxxxx:yyyyyyyy...
```

この行全体をコピーします。

---

## 2. .env 更新

```bash
nano /opt/tisly/server/.env
```

`ADMIN_PASSWORD_HASH=` の行を、上記出力行に**置き換え**ます。

- ❌ `ADMIN_PASSWORD_HASH=temp`（平文 — ログイン不可）
- ✅ `ADMIN_PASSWORD_HASH=scrypt:...`（scrypt 形式）

保存後、値が正しいか確認（値自体は表示しない）:

```bash
grep -E '^ADMIN_PASSWORD_HASH=scrypt:' /opt/tisly/server/.env && echo OK || echo NG
```

---

## 3. systemctl restart

```bash
sudo systemctl restart tisly-server
sudo systemctl status tisly-server --no-pager
```

`active (running)` であることを確認します。

---

## 4. ログイン確認

```bash
curl -s -X POST https://tisly.jp/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"あなたの強力なパスワード"}' | jq .
```

- `token` が返れば成功
- `401 Invalid credentials` の場合は `.env` のハッシュ行とパスワードを再確認

production-check（temp 検知）:

```bash
curl -s https://tisly.jp/api/deploy/production-check | jq '{phase, adminPasswordStatus, operationalReady}'
```

`adminPasswordStatus` が `"GREEN"` であること。

---

## 5. test-email 確認

Gmail SMTP（`SMTP_USER` / `SMTP_PASS`）設定済みの場合:

```bash
TOKEN=$(curl -s -X POST https://tisly.jp/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"あなたの強力なパスワード"}' \
  | jq -r .token)

curl -s -X POST https://tisly.jp/api/notifications/test-email \
  -H "Authorization: Bearer $TOKEN" | jq .
```

- `ok: true` → 成功
- `401` → admin トークン未取得（ステップ 4 を先に）
- SMTP 未設定 → App Hub の Gmail カードで `smtpConfigured: false` を確認

ブラウザから: `https://tisly.jp/app` → ログイン → 「Gmail通知テスト」カード

---

## チェックリスト

| 手順 | 確認 |
|------|------|
| `npm run hash:admin-password` 実行 | ☐ |
| `.env` に `scrypt:` 形式を貼り付け | ☐ |
| `systemctl restart tisly-server` | ☐ |
| `POST /api/auth/login` で token 取得 | ☐ |
| `production-check` → `adminPasswordStatus: GREEN` | ☐ |
| `POST /api/notifications/test-email` → `ok: true` | ☐ |

---

## やってはいけないこと

- `.env` に `ADMIN_PASSWORD_HASH=temp` や平文パスワードを置く
- 生成したハッシュやパスワードを Slack / docs / git に貼る
- 再起動せずにログイン確認する

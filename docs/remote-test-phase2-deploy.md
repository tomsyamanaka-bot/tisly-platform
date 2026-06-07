# Phase 2 — Remote Test 本番デプロイ & 操作ガイド

**目的:** iPhone から `https://tisly.jp/remote-test` で通知・CH1 遠隔操作し、RP2350 GPIO17 を制御する。

---

## 1. VPS で必要な設定

### 1-1. トークン生成（VPS で1回）

```bash
openssl rand -hex 16
```

表示された文字列をメモ（例: `a1b2c3d4e5f6789012345678abcdef01`）。

### 1-2. .env に追記

```bash
cd /opt/tisly/server
nano .env
```

以下を追記（または `server/.env.sample` を参考）:

```env
REMOTE_TEST_TOKEN=（上で生成した値）
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

Discord Webhook の取得: Discord サーバー → チャンネル設定 → 連携サービス → Webhook → URL をコピー。

**iPhone に Push 通知も欲しい場合（任意）:**

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@tisly.jp
```

生成: `cd /opt/tisly/server && npx web-push generate-vapid-keys`

### 1-3. コード反映 & 再起動

```bash
cd /opt/tisly
git pull origin master
cd server
npm ci
npm run build
sudo systemctl restart tisly-server
sudo nginx -t && sudo systemctl reload nginx
```

または既存のデプロイスクリプト:

```bash
cd /opt/tisly && bash scripts/deploy.sh
```

### 1-4. 動作確認（VPS）

```bash
TOKEN="あなたのREMOTE_TEST_TOKEN"

# ページ
curl -sI https://tisly.jp/remote-test | head -1

# API
curl -s -H "X-Remote-Test-Token: $TOKEN" https://tisly.jp/api/remote-test/status | jq .
```

---

## 2. Cursor（ローカル開発）での確認

```powershell
cd C:\Users\yaman\TiSLY_HOME_Security_DEMO\server
cp .env.sample .env
# .env に REMOTE_TEST_TOKEN と DISCORD_WEBHOOK_URL を記入
npm install
npm run build
npm run dev
```

ブラウザ: http://localhost:3080/remote-test

テスト:

```powershell
cd server
npm run test -- test/remote-test.test.ts
```

---

## 3. iPhone での操作

1. Safari で **https://tisly.jp/remote-test** を開く
2. **REMOTE_TEST_TOKEN** を入力 →「トークンを保存」
3. **Push 登録**（任意）: ホーム画面に追加 → Push 登録 → 通知許可
4. **通知テスト送信** → Discord / Push に「TiSLY 通知テスト成功」
5. **CH1 ON** → RP2350 の GPIO17 が ON
6. **CH1 OFF** → GPIO17 が OFF
7. **デバッグ情報** で RP2350 接続時刻が更新されることを確認

---

## 4. RP2350 での設定

### 4-1. ファイル配置

Thonny で RP2350 に接続し:

1. Waveshare 同梱 `lib/`（W5500 用）をボードにコピー
2. `rp2350/firmware/remote_test_poll.py` をボード直下にコピー
3. ファイル内の `REMOTE_TEST_TOKEN` を VPS `.env` と同じ値に変更

### 4-2. 実行

Thonny → `remote_test_poll.py` → Run

期待ログ:

```
========================================
           TISLY BOOT
========================================

[remote_test] Ethernet: OK (Ethernet (LAN))
[remote_test] 取得IP: 192.168.x.x
[remote_test] サーバ接続: OK
[remote_test] ポーリング開始 (3秒間隔)
```

### 4-3. 動作確認

iPhone で CH1 ON → シリアルに `EXEC CH1 ON → GPIO17 = HIGH`  
iPhone で CH1 OFF → シリアルに `EXEC CH1 OFF → GPIO17 = LOW`

---

## 5. 完了条件チェックリスト

| # | 条件 | 確認方法 |
|---|------|----------|
| ① | iPhone で `/remote-test` が開ける | Safari で URL を開く |
| ② | 通知ボタンでスマホへ通知 | Discord または Push |
| ③ | CH1 ON → GPIO17 ON | リレー動作 / シリアルログ |
| ④ | CH1 OFF → GPIO17 OFF | リレー動作 / シリアルログ |

---

## 6. トラブルシュート

| 症状 | 対処 |
|------|------|
| 503 トークン未設定 | VPS `.env` に `REMOTE_TEST_TOKEN` を追加 → restart |
| 403 トークン不一致 | iPhone / RP2350 / VPS で同じ値か確認 |
| 通知が届かない | `DISCORD_WEBHOOK_URL` 確認 / Push は VAPID + 登録必要 |
| RP2350 が反応しない | Ethernet IP 確認 / トークン / `urequests` インストール |
| RP2350接続時刻が更新されない | `remote_test_poll.py` が動いているか確認 |

---

## 関連ファイル

| ファイル | 説明 |
|----------|------|
| `server/.env.sample` | 最小 env テンプレート |
| `server/public/remote-test.html` | Web UI |
| `server/src/api/routes/remote-test.ts` | API |
| `rp2350/firmware/remote_test_poll.py` | RP2350 ポーリング |

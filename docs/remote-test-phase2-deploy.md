# Phase 2 — Remote Test 本番デプロイ & 操作ガイド

**目的:** iPhone PWA 単体で `https://tisly.jp/remote-test` から Web Push 通知・CH1 遠隔操作し、RP2350 GPIO17 を制御する。

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
```

### 1-3. VAPID 鍵の自動設定（必須）

```bash
cd /opt/tisly/server
npm run vapid:setup
```

`server/.env` に VAPID 鍵 3 行が書き込まれます。詳細: `docs/vapid_env_setup.md`

### 1-4. コード反映 & 再起動

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

### 1-5. 動作確認（VPS）

```bash
TOKEN="あなたのREMOTE_TEST_TOKEN"

# ページ
curl -sI https://tisly.jp/remote-test | head -1

# API
curl -s -H "X-Remote-Test-Token: $TOKEN" https://tisly.jp/api/remote-test/status | jq .

# VAPID
npm run vapid:generate -- --check
curl -s https://tisly.jp/api/notifications/vapid-public-key | jq .
```

---

## 2. Cursor（ローカル開発）での確認

```powershell
cd C:\Users\yaman\TiSLY_HOME_Security_DEMO\server
cp .env.sample .env
# .env に REMOTE_TEST_TOKEN を記入
npm run vapid:setup
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

## 3. iPhone での操作（PWA フロー）

```
Safari → ホーム画面追加 → Push 登録 → Push テスト → 遠隔操作
```

1. Safari で **https://tisly.jp/remote-test** を開く
2. **REMOTE_TEST_TOKEN** を入力 →「トークンを保存」
3. 共有ボタン → **ホーム画面に追加**（iOS 16.4+）
4. ホーム画面の **TiSLY Remote** から起動
5. **Push 登録** → 通知を許可
6. **Push テスト** → iPhone に「TiSLY 通知テスト成功」
7. **CH1 ON** → RP2350 の GPIO17 が ON
8. **CH1 OFF** → GPIO17 が OFF
9. 画面の **Push 登録状態 / Push 送信結果 / Push 成功時刻** を確認

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
| ② | ホーム画面 PWA から Push 登録 | 登録状態が「登録済み」 |
| ③ | Push テストで iPhone に通知 | Push 成功時刻が更新 |
| ④ | CH1 ON → GPIO17 ON | リレー動作 / シリアルログ |
| ⑤ | CH1 OFF → GPIO17 OFF | リレー動作 / シリアルログ |

---

## 6. トラブルシュート

| 症状 | 対処 |
|------|------|
| 503 トークン未設定 | VPS `.env` に `REMOTE_TEST_TOKEN` を追加 → restart |
| 403 トークン不一致 | iPhone / RP2350 / VPS で同じ値か確認 |
| Push 登録不可 | ホーム画面 PWA から起動（通常 Safari タブ不可） |
| Push が届かない | `npm run vapid:setup` → 再起動 / Push 登録を再実行 |
| VAPID 未設定 | `npm run vapid:setup` → `npm run vapid:generate -- --check` |
| RP2350 が反応しない | Ethernet IP 確認 / トークン / `urequests` インストール |
| RP2350接続時刻が更新されない | `remote_test_poll.py` が動いているか確認 |

---

## 関連ファイル

| ファイル | 説明 |
|----------|------|
| `server/.env.sample` | PWA 最小 env テンプレート |
| `server/public/remote-test.html` | Web UI |
| `server/src/api/routes/remote-test.ts` | API |
| `rp2350/firmware/remote_test_poll.py` | RP2350 ポーリング |

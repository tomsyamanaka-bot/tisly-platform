# VAPID キー — `.env` 設定手順

Web Push（iPhone PWA 通知）に必要な VAPID 鍵を `server/.env` に設定する手順です。  
**Remote Test は Web Push が必須** — Discord なしで iPhone PWA 単体で通知・遠隔操作が成立します。

---

## 1. 自動設定（推奨）

```bash
cd server
npm run vapid:setup
```

- `server/.env` が無ければ `.env.example` から作成
- VAPID 鍵が未設定の場合のみ、3 行を自動書き込み
- 既に鍵がある場合はスキップ（上書きしない）

---

## 2. 手動生成（stdout 出力）

```bash
cd server
npm run vapid:generate
```

出力例:

```env
VAPID_PUBLIC_KEY=BNx...
VAPID_PRIVATE_KEY=abc...
VAPID_SUBJECT=mailto:admin@tisly.jp
```

`.env` に貼り付けるか、`npm run vapid:generate -- --write` で強制上書き。

---

## 3. サーバー再起動

**ローカル開発:**

```powershell
cd server
npm run dev
```

**本番 VPS:**

```bash
sudo systemctl restart tisly-server
```

---

## 4. 設定確認

```bash
cd server
npm run vapid:generate -- --check
```

期待出力: `VAPID keys: OK`

API 確認:

```bash
curl -s http://localhost:3080/api/notifications/vapid-public-key
# → {"publicKey":"BNx..."}
```

`publicKey` が空文字の場合は `.env` 未読込または再起動忘れ。

---

## 5. iPhone Remote Test フロー

```
Safari で /remote-test を開く
  ↓
ホーム画面に追加（iOS 16.4+）
  ↓
PWA から Push 登録 → 通知を許可
  ↓
Push テスト → 通知受信
  ↓
CH1 ON/OFF で遠隔操作
```

1. `https://tisly.jp/remote-test` を Safari で開く
2. **REMOTE_TEST_TOKEN** を入力 → 保存
3. **ホーム画面に追加**
4. PWA から **Push 登録** → 通知を許可
5. **Push テスト** で「TiSLY 通知テスト成功」を確認
6. **CH1 ON/OFF** で RP2350 を遠隔操作

---

## トラブルシュート

| 症状 | 対処 |
|------|------|
| `VAPID keys not configured` | `npm run vapid:setup` → 再起動 |
| `--check` が NOT CONFIGURED | 鍵名の typo、`=` 前後の空白、`.env` パス |
| Push 登録で「VAPID 未設定」 | 再起動後 `/api/notifications/vapid-public-key` を確認 |
| iPhone に Push が来ない | ホーム画面 PWA + Push 登録 + VAPID 設定 |
| Push 非対応と表示 | 通常 Safari タブでは不可 — ホーム画面 PWA から起動 |

---

## 関連

| ファイル | 内容 |
|----------|------|
| `server/scripts/generate-vapid-keys.mjs` | 鍵生成・自動書き込み |
| `docs/web_push_setup.md` | Web Push アーキテクチャ詳細 |
| `docs/remote-test-phase2-deploy.md` | iPhone Remote Test 全体手順 |

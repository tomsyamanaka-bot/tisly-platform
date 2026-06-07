# Web Push（VAPID）セットアップ

TiSLY PWA がブラウザ通知を受け取るための手順です。

## VAPID とは

**Voluntary Application Server Identification** — プッシュサービス（Apple / Google 等）に対し、送信元アプリサーバーを識別する鍵ペアです。  
サーバーは **秘密鍵** で署名し、PWA は **公開鍵** で購読（subscription）を登録します。

## 鍵の発行

**自動設定（推奨）:**

```bash
cd server
npm run vapid:setup
```

**手動生成（stdout 出力）:**

```bash
cd server
npm run vapid:generate
```

従来の方法（同等）:

```bash
cd server
npx web-push generate-vapid-keys
```

詳細手順: **`docs/vapid_env_setup.md`**

## `.env` への設定

```env
VAPID_PUBLIC_KEY=<Public Key>
VAPID_PRIVATE_KEY=<Private Key>
VAPID_SUBJECT=mailto:admin@tisly.jp
```

`VAPID_SUBJECT` は `mailto:` または `https://tisly.jp` 形式。秘密鍵は **絶対にコミットしない**。

サーバー再起動後、`GET /api/notifications/vapid-public-key` で公開鍵が返ることを確認。

## PWA 側の登録

1. **HTTPS** でアクセス（localhost は開発例外）
2. `public/push-register.js` またはダッシュボードの「Push 登録」
3. Service Worker: `service-worker.js`（`sw.js` と同一内容のエイリアス可）
4. `POST /api/notifications/subscribe` に subscription を送信

フロー:

```
ユーザー許可 → PushManager.subscribe(VAPID公開鍵)
  → POST /api/notifications/subscribe
  → DB (notification_tokens / pwa_subscriptions)
```

## iPhone（Safari）での注意点

- **ホーム画面に追加**した PWA のみ Web Push が利用可能（iOS 16.4+）
- 通常 Safari タブのみでは Push 不可のことが多い
- 通知許可は「設定 → 通知」でも確認
- サイレント Push は不可 — 表示通知として届く

## 通知許可の確認

ブラウザ開発者ツール → Application → Service Workers / Notifications  
またはダッシュボードの Push 登録ボタン実行後、成功メッセージを確認。

## Remote Test（iPhone PWA PoC）

`/remote-test` は **Web Push 最優先** — Discord 不要で iPhone PWA 単体で通知・遠隔操作が成立します。

```
Safari → ホーム画面追加 → Push 登録 → Push テスト → CH1 遠隔操作
```

詳細: `docs/remote-test-phase2-deploy.md` / `docs/vapid_env_setup.md`

## テスト通知 API

```bash
# Web Push テスト（登録済み subscription 必須）
curl -X POST https://tisly.jp/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{"channel":"web_push"}'
```

従来形式: `POST /api/notifications/test/web_push` も利用可。

PWA UI: ダッシュボード「通知テスト」ボタン → `push-register.js` の `sendTestNotification()`。

## 通知が来ないとき

| チェック | 内容 |
|----------|------|
| HTTPS | 本番は必須 |
| VAPID | `.env` 両鍵、サーバー再起動 |
| 登録 | `subscribe` が 201、DB に endpoint あり |
| 期限切れ subscription | 410 時は再登録 |
| Platform Settings | `push.enabled` が true |
| iOS | ホーム画面 PWA + 許可 |

ログ: `journalctl -u tisly-server -f` で `web_push` 送信エラーを確認。

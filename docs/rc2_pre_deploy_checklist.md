# RC2 本番公開前チェックリスト（Phase 1281–1290）

tisly.jp **初回公開**前に人が手で確認する項目です。  
初回公開は **mock 安全状態** で固定します（real 接続は次フェーズ）。

自動テスト: `server/test/phase1241-1280.test.ts` · 状態ドキュメント: `docs/phase1281_1290_status.md`

---

## A. ビルド・型・テスト（ローカル or VPS）

```bash
cd server
npm run build
npx tsc --noEmit
npm run test
```

- [ ] `npm run build` 成功
- [ ] `npx tsc --noEmit` エラーなし
- [ ] `npm run test` — **356 pass / 0 fail**

---

## B. 初回公開 URL（本番アクセス）

ベース: `https://tisly.jp`

| # | URL | 確認内容 |
|---|-----|----------|
| 1 | `/app` | App Hub · **本番公開チェックカード**表示 |
| 2 | `/survey` | 現調 PWA 読込 |
| 3 | `/business` | TOMS Business SPA |
| 4 | `/sales` | 営業デモ TOP · 接続バッジ |
| 5 | `/customer/TOMS001` | 顧客ポータル |

追加（RC2 フロー）:

| URL | 確認内容 |
|-----|----------|
| `/customer/TOMS001/pro-remote` | PRO Remote · floor stack UI |
| `/customer/TOMS001/install/home` | 施工 PWA（**リロード 404 なし**） |
| `/tv/TOMS001` | Google TV Web ダッシュボード |
| `/deployment/checklist` | 導入チェックリスト |

- [ ] 上記 URL が HTTPS で 200（または SPA として正常表示）
- [ ] HTTP → HTTPS リダイレクト動作

---

## C. 実機 PWA インストール（必須）

### iPhone（Safari）— 現調 PWA

1. Safari で `https://tisly.jp/survey` を開く
2. 共有ボタン → **ホーム画面に追加**
3. 追加後、standalone 表示で起動できること

- [ ] iPhone `/survey` ホーム画面追加 OK
- [ ] standalone 起動 OK

### Android（Chrome）— App Hub

1. Chrome で `https://tisly.jp/app` を開く
2. メニュー → **ホーム画面に追加**（またはインストールバナー）
3. 追加後、standalone 表示で起動できること
4. 本番公開チェックカードが表示されること

- [ ] Android `/app` ホーム画面追加 OK
- [ ] standalone 起動 OK
- [ ] 本番公開チェックカード表示 OK

---

## D. mock / real 状態確認

### env（VPS `.env` — 初回公開は mock 維持）

`server/.env.production.example` をコピーし本番値を設定:

- [ ] `NODE_ENV=production`
- [ ] `TISLY_PUBLIC_URL=https://tisly.jp`（localhost ではない）
- [ ] `JWT_SECRET` — `openssl rand -hex 32`
- [ ] `ADMIN_PASSWORD_HASH` — hashPassword() で生成
- [ ] `INGEST_SECRET` — デフォルト値でない
- [ ] `TISLY_DEMO_MODE=false`
- [ ] `DEMO_RESET_ENABLED=false`

**mock 維持（必須）:**

- [ ] `GMAIL_SEND_MODE=mock`
- [ ] `QNAP_UPLOAD_MODE=mock`
- [ ] `MQTT_MODE=mock` · `MQTT_MOCK_MODE=true`
- [ ] `SHELLY_MODE=mock`
- [ ] `GOOGLE_OAUTH_ENABLED=false`

参照: `docs/mock_real_modes.md` · `docs/phase1281_1290_status.md`

### API + UI での確認

```bash
curl -s https://tisly.jp/api/pwa/publish-audit | jq .
```

- [ ] `isProductionUrl: true`
- [ ] `mockReal` 配列で各サービスが `mode: "mock"`（Gmail/QNAP/MQTT/Shelly）
- [ ] `hasBlockingEnvErrors: false`
- [ ] 各 PWA の `manifestUrl` が 404 でない
- [ ] `service-worker.js` が 200

`/app` 本番公開チェックカード:

- [ ] `TISLY_PUBLIC_URL ✓ 本番` と表示
- [ ] mock/real チップがすべて mock（real は赤表示でない）
- [ ] 各 PWA の OK/注意/未対応が一目で分かる
- [ ] 「本番URLコピー」ボタンが動作

---

## E. インフラ反映

- [ ] `server/deploy/nginx/tisly.jp.conf` を VPS に配置
- [ ] `sudo nginx -t` OK
- [ ] `sudo systemctl reload nginx`
- [ ] Let's Encrypt 証明書有効（`certbot renew --dry-run`）
- [ ] `systemctl status tisly-server` active
- [ ] `wss://tisly.jp/ws` 接続可能

---

## F. デモ・監視フロー確認

- [ ] `/sales` — 営業デモ（mock 接続バッジ）が動作
- [ ] `/customer/TOMS001/pro-remote` — フロアスタック RC2（perimeter/1f/2f、roof なし）
- [ ] `/tv/TOMS001` — TV ダッシュボード表示

### Google TV focus API（mock — 外部テレビ操作なし）

```bash
curl -s -X POST https://tisly.jp/api/tv/focus-camera \
  -H "Content-Type: application/json" \
  -d '{"customerCode":"TOMS001","cameraId":"CAM-RC2-TV","floor":"2f","trigger":"checklist","durationSec":10}'
```

- [ ] HTTP 201 · `event: focusCamera`

### API サンプル

```bash
GET /api/customer/TOMS001/pro-remote/floor-stack?rc=2
```

- [ ] `tiers: ["perimeter", "1f", "2f"]` · roof なし

---

## G. セキュリティ最終確認

- [ ] 平文パスワードを `.env` に置いていない
- [ ] `.env` が git に含まれていない（`git status` で未追跡の `.env` のみ）
- [ ] git diff に token / password / secret / refresh_token の実値がない
- [ ] Mosquitto 1883 は 127.0.0.1 のみ（外部閉鎖）
- [ ] 本番画面に不要な debug 表示がない
- [ ] mock 状態でメール送信・NAS 書込・MQTT publish が発生しない
- [ ] `GET /api/health/full` — 想定内の状態

---

## H. 1案件フロー通し確認（任意・ステージング）

1. `/field/new` で案件作成
2. `/survey` で現調
3. `/business` で見積
4. `/customer/:code/install/home` で施工
5. `/customer/:code/pro-remote` で監視
6. `/tv/:code` で TV ミラー
7. `/deployment/checklist/:projectId` で引き渡し

参照: `docs/first_customer_trial_runbook.md`

---

## 完了署名

| 項目 | 担当 | 日付 |
|------|------|------|
| ビルド/テスト（356 pass） | | |
| .env 本番値 + mock 維持 | | |
| nginx / HTTPS | | |
| iPhone `/survey` PWA | | |
| Android `/app` PWA | | |
| 本番 URL 表示 | | |
| publish-audit / チェックカード | | |
| mock/real 確認 | | |
| セキュリティ | | |

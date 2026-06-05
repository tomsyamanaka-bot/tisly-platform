# Phase 1281–1290 — First Public Deploy Finalization

**初回公開（mock 安全状態）の固定化**

Phase 1241–1280 で整備した本番 URL・PWA 監査・env テンプレートを、
「どこまで本番」「どこが mock」「次に real 化するもの」が誰でも分かる状態に確定する。

---

## 初回公開 URL 一覧（必須 5 + 関連）

| # | 本番 URL | 用途 |
|---|----------|------|
| 1 | https://tisly.jp/app | App Hub · 本番公開チェックカード |
| 2 | https://tisly.jp/survey | 現調 PWA（**iPhone ホーム画面追加**） |
| 3 | https://tisly.jp/business | TOMS Business |
| 4 | https://tisly.jp/sales | 営業デモ |
| 5 | https://tisly.jp/customer/TOMS001 | 顧客ポータル（デモ顧客） |

### 関連 URL（RC2 フロー）

| URL | 用途 |
|-----|------|
| https://tisly.jp/customer/TOMS001/pro-remote | PRO Remote 監視 |
| https://tisly.jp/customer/TOMS001/install/home | 施工 PWA |
| https://tisly.jp/tv/TOMS001 | Google TV Web |
| https://tisly.jp/deployment/checklist | 導入チェックリスト |
| https://tisly.jp/api/pwa/publish-audit | PWA 公開監査 JSON |

---

## 現在 mock のまま残す項目（初回公開固定）

初回公開は **外部送信・実機操作を起こさない** ため、以下を維持する。

| env | 値 | 効果 |
|-----|-----|------|
| `GMAIL_SEND_MODE` | `mock` | 実メール送信なし（ログのみ） |
| `QNAP_UPLOAD_MODE` | `mock` | NAS WebDAV 書込なし（`uploads/qnap-mock/`） |
| `MQTT_MODE` | `mock` | ブローカー接続なし |
| `MQTT_MOCK_MODE` | `true` | シミュレーション heartbeat |
| `SHELLY_MODE` | `mock` | リレー遠隔操作なし |
| `GOOGLE_OAUTH_ENABLED` | `false` | Gmail OAuth 未接続 |
| `TISLY_DEMO_MODE` | `false` | デモ専用モード OFF |
| `DEMO_RESET_ENABLED` | `false` | デモ DB リセット無効 |

テンプレート: `server/.env.production.example`  
ソースオブトゥルース: `server/src/config/production-env-checker.ts` の `MOCK_REAL_GUARDS`

---

## real 切替時に必要な env（次フェーズ）

個別に real 化する際のみ設定。切替前に `docs/rc2_pre_deploy_checklist.md` と
`docs/mock_real_modes.md` を必ず確認すること。

### MQTT

```env
MQTT_MODE=real
MQTT_MOCK_MODE=false
MQTT_URL=mqtt://127.0.0.1:1883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_SUBSCRIBER_ENABLED=true
```

参照: `docs/mqtt_real_connection.md`

### Shelly

```env
SHELLY_MODE=real
SHELLY_BASE_URL=http://192.168.x.x
SHELLY_AUTH_TOKEN=
```

参照: `docs/shelly_gen3_provisioning.md`

### QNAP WebDAV

```env
QNAP_UPLOAD_MODE=real
QNAP_WEBDAV_URL=https://nas.example.local:5006/TOMS
QNAP_USERNAME=
QNAP_PASSWORD=
```

参照: `docs/qnap_webdav_real_upload.md`  
追加ガード: `assertRealSendAllowed("qnap_real_upload")`

### Gmail OAuth

```env
GOOGLE_OAUTH_ENABLED=true
GMAIL_SEND_MODE=real
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://tisly.jp/business/settings
GOOGLE_REFRESH_TOKEN=
```

参照: `docs/google_gmail_oauth_business.md`  
追加ガード: `business_real_send_settings` + UI `confirmed: true`

---

## ビルド・テスト結果（Phase 1281–1290 確定時）

```bash
cd server
npm run build          # 成功
npx tsc --noEmit       # エラーなし
npm run test           # 356 pass / 0 fail
```

自動テスト: `server/test/phase1241-1280.test.ts`（PWA 監査 · nginx · env 例）

---

## 公開状態の確認手段

| 手段 | 内容 |
|------|------|
| `GET /api/pwa/publish-audit` | 本番 URL · PWA 準備 · mock/real · env チェック JSON |
| `/app` 本番公開チェックカード | UI で OK/注意/未対応 · mock/real チップ · 本番 URL コピー |
| `GET /api/health/full` | インフラ詳細ヘルス |
| `GET /api/toms/live/connection-status` | 統合接続バッジ用 |

---

## セキュリティ方針（初回公開）

- `.env` 実体は **git に含めない**（`.gitignore` で除外済み）
- テスト用 `server/uploads/` はコミット対象外（ローカル試験データ）
- mock 状態では Gmail / QNAP / MQTT / Shelly への外部副作用なし
- 本番 VPS では `TISLY_DEMO_MODE=false` · `DEMO_RESET_ENABLED=false` を維持

---

## 関連ドキュメント

| ドキュメント | 内容 |
|--------------|------|
| `docs/rc2_pre_deploy_checklist.md` | 公開前人手チェック（iPhone/Android PWA 含む） |
| `docs/production_routes.md` | 本番 URL 構成 |
| `docs/mock_real_modes.md` | Mock/Real 切替一覧 |
| `docs/tisly_jp_deploy_runbook.md` | VPS デプロイ手順 |

# Demo / Mock / Real 切替一覧（Phase 1201–1240）

営業デモは **mock 既定** で安全に運用できます。  
`real` に切り替えると外部システムへ副作用が発生します。

ソースオブトゥルース: `server/src/config/production-env-checker.ts` の `MOCK_REAL_GUARDS`

## 営業デモで mock のまま使えるもの

| 機能 | 既定 env | デモ時の挙動 |
|------|----------|--------------|
| 営業トップ `/sales` | 各種 mock | Mock/Real/Mixed UI 切替（API は mock 安全） |
| MQTT イベント | `MQTT_MODE=mock` | シミュレーション heartbeat · WS mock push 可 |
| Shelly テレメトリ | `SHELLY_MODE=mock` | 仮想 RPC 応答 |
| Gmail 送信 | `GMAIL_SEND_MODE=mock` | ログのみ・接続済み表示 |
| QNAP Business PDF | `QNAP_UPLOAD_MODE=mock` | `server/uploads/qnap-mock/` |
| QNAP SMB | `QNAP_MODE=mock` | `data/qnap-archive/` ローカル |
| Google TV focus | API mock state | DB/WS のみ・実テレビハード操作なし |
| device-mode | `TISLY_DEVICE_MODE=mock` | ESP/Shelly 仮想デバイス |

`npm run demo` は `TISLY_DEMO_MODE=true` を設定して起動します（本番 VPS では使用しない）。

## real に切り替えると危険なこと

### Gmail / Google OAuth

| 項目 | 内容 |
|------|------|
| env | `GOOGLE_OAUTH_ENABLED=true`, `GMAIL_SEND_MODE=real` |
| 危険 | 顧客・取引先への**実メール送信** |
| 追加ガード | `business_real_send_settings`（mockOnly/dryRun/realSendEnabled）+ UI `confirmed: true` |
| 参照 | `docs/gmail_real_send_dlq.md`, `docs/business_real_send_guard.md` |

### QNAP Business WebDAV

| 項目 | 内容 |
|------|------|
| env | `QNAP_UPLOAD_MODE=real`, `QNAP_WEBDAV_URL`, credentials |
| 危険 | 見積 PDF の **NAS 上書き**・フォルダ誤操作 |
| 追加ガード | `assertRealSendAllowed("qnap_real_upload")` |
| 参照 | `docs/qnap_webdav_real_upload.md` |

### QNAP SMB Archive

| 項目 | 内容 |
|------|------|
| env | `QNAP_MODE=real`, `QNAP_HOST`, SMB credentials |
| 危険 | イベント/レポートの NAS 書込 |
| 参照 | `server/src/qnap/smb-client.ts` |

### Shelly

| 項目 | 内容 |
|------|------|
| env | `SHELLY_MODE=real`, `SHELLY_BASE_URL`, `SHELLY_AUTH_TOKEN` |
| 危険 | リレー**遠隔操作**・実機設定変更 |
| API | `POST /api/shelly/register`, `POST /api/shelly/test` |
| 参照 | `docs/shelly_gen3_provisioning.md`, `docs/shelly_real_e2e.md` |

### MQTT

| 項目 | 内容 |
|------|------|
| env | `MQTT_MODE=real`, `MQTT_URL`, `MQTT_SUBSCRIBER_ENABLED=true` |
| 危険 | ブローカー publish/subscribe・**現場デバイスへのコマンド** |
| フォールバック | TLS 証明書不足時は mock へ自動フォールバック |
| 参照 | `docs/mqtt_real_connection.md` |

### Google TV

| 項目 | 内容 |
|------|------|
| env | `TISLY_PUBLIC_URL=https://tisly.jp`, WSS |
| 危険 | URL 誤設定でペアリング失敗・focus イベント誤配信 |
| Web API | `POST /api/tv/focus-camera` — mock でも state/WS は動作 |
| ネイティブ tv-app | `EXPO_PUBLIC_MQTT_MOCK`, `EXPO_PUBLIC_API_URL` |
| 参照 | `docs/google_tv_focus_camera.md` |

## Business 二重ガード（DB 設定）

`platform_settings.business_real_send_settings`:

| フラグ | 意味 |
|--------|------|
| `mockOnly` | mock 以外拒否（既定 true 推奨） |
| `dryRun` | ログのみ |
| `realSendEnabled` | 本番送信許可 |

UI: `/business/settings` — 危険操作は `confirmRealSend()` 必須。

## 接続状態の確認

| 手段 | URL / API |
|------|-----------|
| 接続バッジ | 各 PWA — `connection-badges.js` |
| 統合状態 | `GET /api/toms/live/connection-status` |
| フルヘルス | `GET /api/health/full` |
| 営業 checklist | `GET /api/demo-kit/sales/checklist` |
| 起動前 env | サーバー起動ログ — `logProductionEnvWarnings()` |

## 本番投入時の推奨構成

```env
# 営業デモ併用 — mock 維持
MQTT_MODE=mock
SHELLY_MODE=mock
QNAP_UPLOAD_MODE=mock
QNAP_MODE=mock
GOOGLE_OAUTH_ENABLED=false
GMAIL_SEND_MODE=mock
TISLY_DEMO_MODE=false
DEMO_RESET_ENABLED=false
```

実機接続フェーズで個別に `real` へ切替。切替前に `docs/rc2_pre_deploy_checklist.md` を実施。

## 初回公開固定状態（Phase 1281–1290）

初回 tisly.jp 公開時点の確定値:

| env | 値 |
|-----|-----|
| `GMAIL_SEND_MODE` | `mock` |
| `QNAP_UPLOAD_MODE` | `mock` |
| `MQTT_MODE` | `mock` |
| `MQTT_MOCK_MODE` | `true` |
| `SHELLY_MODE` | `mock` |
| `GOOGLE_OAUTH_ENABLED` | `false` |
| `TISLY_DEMO_MODE` | `false` |
| `DEMO_RESET_ENABLED` | `false` |

ビルド検証（確定時）: `npm run build` 成功 · `npx tsc --noEmit` エラーなし · `npm run test` 356 pass / 0 fail

詳細: `docs/phase1281_1290_status.md`

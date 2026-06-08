# TiSLY_HOME_Security_DEMO

TiSLY HOME Security のデモ展示用 PLC ラダープログラムです。  
三菱電機 **FX 系** PLC と **GX Works2 / GX Works3** を想定しています。

## リポジトリ構成について（Phase 1681–1720）

| 項目 | 説明 |
|------|------|
| **GitHub リポジトリ名** | [`tisly-platform`](https://github.com/tomsyamanaka-bot/tisly-platform) |
| **ローカルフォルダ名** | `TiSLY_HOME_Security_DEMO`（PLC デモ等を含む混在構成） |
| **本番デプロイ対象** | `server/` 配下の **TiSLY Platform** 本体 |
| **VPS 配置** | `/opt/tisly/server` をアプリ本体として扱う |
| **フロントエンド** | `server/public/`（ルート `web/` は**不要**） |
| **本番 .env テンプレ** | `server/.env.production.example`（正式版） |

> **本番公開する場合はまず [`docs/vps_first_launch_for_tomonori.md`](docs/vps_first_launch_for_tomonori.md) を見る**

## TiSLY Platform — PWA First Architecture

**TiSLY は PWA 中心。他社 SaaS に依存しない。**

| 領域 | パス / URL |
|------|------------|
| 正式方針 | [`docs/tisly_core_policy.md`](docs/tisly_core_policy.md) |
| TiSLY App | `/tisly-app/home` — Home / Devices / Events / Settings |
| Remote Test | https://tisly.jp/remote-test |
| VAPID 自動設定 | `cd server && npm run vapid:setup` |
| server README | [`server/README.md`](server/README.md) |

---

## TiSLY Platform — Remote Test PoC（Phase 2）

**iPhone から通知 & RP2350 CH1 遠隔操作**

| 領域 | パス / URL |
|------|------------|
| 本番 Web UI | https://tisly.jp/remote-test |
| デプロイ手順 | [`docs/remote-test-phase2-deploy.md`](docs/remote-test-phase2-deploy.md) |
| 最小 .env | `server/.env.sample` |
| RP2350 ファームウェア | `rp2350/firmware/main.py` · `config.py` |
| RP2350 スクリプト（単体） | `rp2350/firmware/remote_test_poll.py` |
| ファームウェア版 | **v1.1.0-poc-success** |

### 【実機確認済み】RP2350-ETH-8DI-8RO

| 項目 | 結果 |
|------|------|
| Ethernet 接続 | 成功（W5500 / DHCP） |
| PWA 制御 | 成功（PWA → VPS → RP2350） |
| CH1 ON/OFF | 成功（リレー実機動作確認済み） |
| heartbeat | 成功（60 秒間隔・接続時刻更新） |
| 命令取得 | 成功（3 秒間隔ポーリング） |

通信間隔: **poll 3 秒** / **heartbeat 60 秒**（`rp2350/firmware/config.py`）

### VPS 本番反映（PoC 成功後・最優先）

智紀さん向け手順: [`docs/remote-test-phase2-deploy.md`](docs/remote-test-phase2-deploy.md) §0

```bash
cd /opt/tisly && git pull origin master
cd /opt/tisly/server && npm run build
cd /opt/tisly/server && npm run vapid:setup    # 初回 or VAPID 未設定時
sudo systemctl restart tisly-server
curl -s -H "X-Remote-Test-Token: $TOKEN" \
  "https://tisly.jp/api/remote-test/heartbeat?firmware=1.1.0-poc-success"
```

### VPS 反映後の確認項目

| # | 確認内容 | 合格基準 |
|---|----------|----------|
| 1 | `/remote-test` で状態確認 | https://tisly.jp/remote-test が開き、トークン保存後にステータスが表示される |
| 2 | RP2350 接続時刻の更新 | RP2350 起動後、画面の **RP2350接続時刻**（`lastSeen`）が更新される |
| 3 | heartbeat 間隔 | 約 **60 秒**に 1 回更新（RP2350 シリアルに `heartbeat sent` が 60 秒ごと） |
| 4 | CH1 ON/OFF 応答 | PWA 操作から **3 秒以内**にリレーが反応（poll 3 秒方針） |
| 5 | offline 判定 | RP2350 電源 OFF または LAN 切断後、約 **90 秒**で offline 表示（`DEVICE_OFFLINE_THRESHOLD_SEC=90`） |

**確認手順（実機）**

1. RP2350 を PoE/LAN 接続して起動 → `/remote-test` で online・接続時刻を確認
2. CH1 ON → 3 秒以内にリレー ON → CH1 OFF → 3 秒以内に OFF
3. RP2350 の電源を切る → 90 秒待つ → 画面が offline になることを確認
4. 電源を戻す → 60 秒以内に online・接続時刻が再更新されること

### 実機反映前 — 最終確認（heartbeat / poll 分離）

詳細チェックリスト・トラブル切り分け: [`rp2350/firmware/README.md`](rp2350/firmware/README.md) §「実機反映前 — 最終確認」

**Thonny で RP2350 直下へ上書き（今回）:** `config.py` · `main.py`（`lib/` は変更不要）

| 手順 | 内容 |
|------|------|
| 1 | Thonny で `config.py` と `main.py` を RP2350 直下へ上書き |
| 2 | RP2350 を **RESET** |
| 3 | Shell で `[tisly] polling start (poll 3 sec / heartbeat 60 sec)` と `[tisly] heartbeat sent` を確認 |
| 4 | 以降 `heartbeat sent` が **約 60 秒に 1 回** のみ出ること |
| 5 | PWA で CH1 ON/OFF → 各 **3 秒以内**に `EXEC CH1 ON` / `EXEC CH1 OFF` |

**トラブル切り分け（要約）**

| 症状 | 対処 |
|------|------|
| `heartbeat sent` が 3 秒ごと | RP2350 側 `main.py` が古い → 再アップロード |
| `polling start` 表記が古い | `main.py` 未上書き |
| CH1 無反応 | `poll_command` · トークン · VPS command API |
| heartbeat 不出力 | heartbeat API · トークン · LAN · DHCP |

次フェーズ設計（実装は未着手）: [`docs/rp2350_phase3_design.md`](docs/rp2350_phase3_design.md)

---

## TiSLY Platform — Admin Password Recovery（Phase 2381–2400）

**本番 admin ログイン復旧 · Gmail test-email 認証 · `ADMIN_PASSWORD_HASH=temp` 廃止**

| 領域 | パス / 成果物 |
|------|----------------|
| パスワード復旧手順 | `docs/admin-password-recovery.md` |
| ハッシュ生成 CLI | `npm run hash:admin-password`（`server/scripts/hash-admin-password.mjs`） |
| production-check | `GET /api/deploy/production-check` — `adminPasswordStatus: GREEN\|RED` |
| temp 検知 | `ADMIN_PASSWORD_HASH=temp` → **RED** · `operationalReady: false` |
| env checker | `server/src/config/production-env-checker.ts` — temp は error |
| テスト | `server/test/phase2381-2400.test.ts` |

```bash
cd server && npm run hash:admin-password -- 'your-strong-password'
cd server && npm run test:phase2381
```

---

## TiSLY Platform — VPS Deploy Final Human Guide（Phase 1541–1580）

**智紀さん向け — 初回公開の最終ガイド・安全確認・失敗時復旧（新機能追加なし）**

| 領域 | パス / 成果物 |
|------|----------------|
| 超初心者 VPS 手順 | `docs/vps_first_launch_for_tomonori.md` |
| .env ウィザード | `docs/env_fill_in_guide.md` |
| 公開後 curl 確認 | `docs/production_check_commands.md` |
| ロールバック手順 | `docs/rollback_guide.md` · `scripts/rollback.sh` |
| 投入前チェック CLI | `scripts/vps-first-deploy-check.sh`（色付き · 次アクション表示） |
| 本番公開チェックページ | `https://tisly.jp/deployment/checklist`（mock/real · Google TV 追加） |
| テスト | `server/test/phase1541-1580.test.ts` |

### VPS で実行する最小コマンド（智紀さん向け）

```bash
cd /opt/tisly && bash scripts/vps-first-deploy-check.sh
cd /opt/tisly && bash scripts/vps-deploy-one-command.sh
```

失敗時: `bash /opt/tisly/scripts/rollback.sh`

---

## TiSLY Platform — VPS Deploy Execution & First Production Open（Phase 1501–1540）

**tisly.jp 初回公開 — 投入支援・確認・復旧の強化（新機能追加なし）**

| 領域 | パス / 成果物 |
|------|----------------|
| VPS 初回投入チェック CLI | `scripts/vps-first-deploy-check.sh` |
| VPS 一本化デプロイ | `scripts/vps-deploy-one-command.sh` |
| .env 本番ガイド | `docs/env_production_setup.md` |
| nginx 本番最終版 | `server/deploy/nginx/tisly.jp.conf` |
| 本番公開チェックページ | `https://tisly.jp/deployment/checklist` |
| VPS 手順書 | `docs/tisly_vps_deploy_step_by_step.md` |
| RC2 公開前チェック | `docs/rc2_pre_deploy_checklist.md` |
| テスト | `server/test/phase1501-1540.test.ts` |

### 本番 URL（9 件）

```
https://tisly.jp/app
https://tisly.jp/survey
https://tisly.jp/business
https://tisly.jp/sales
https://tisly.jp/customer/TOMS001
https://tisly.jp/customer/TOMS001/pro-remote
https://tisly.jp/customer/TOMS001/install/home
https://tisly.jp/tv/TOMS001
https://tisly.jp/deployment/checklist
```

### VPS で実行するコマンド（智紀さん向け）

```bash
# 1. 初回投入前チェック
cd /opt/tisly && bash scripts/vps-first-deploy-check.sh

# 2. 一本化デプロイ
cd /opt/tisly && bash scripts/vps-deploy-one-command.sh

# 3. 公開確認（ブラウザ）
# https://tisly.jp/deployment/checklist
```

失敗時: `bash /opt/tisly/scripts/rollback.sh` → `sudo systemctl restart tisly-server`

```bash
cd server && npm run build && npx tsc --noEmit && npm run test && npm run release:gate && npm run deploy:dry-run
```

---

## TiSLY Platform — RC2 Pre-Production Deploy Foundation（Phase 1201–1240）

**tisly.jp 本番公開前 — デプロイ・環境変数・権限・テスト・手順書の確立**

1案件フロー（現調 → AI見積 → Business → 施工 → PRO Remote → Google TV → 引き渡し）完了後、
本番投入に必要な基盤を固めます。

| 領域 | パス / 成果物 |
|------|----------------|
| 本番 URL 構成 | `docs/production_routes.md` — `/app` `/survey` `/business` `/sales` 等 |
| VPS デプロイ Runbook | `docs/tisly_jp_deploy_runbook.md` — nginx · SSL · systemd · rollback |
| 起動前 env checker | `server/src/config/production-env-checker.ts` — 不足時 warning |
| Mock/Real 切替一覧 | `docs/mock_real_modes.md` — Gmail/QNAP/Shelly/MQTT/Google TV |
| RC2 公開前チェックリスト | `docs/rc2_pre_deploy_checklist.md` |
| 本番ルート定義 | `server/src/config/production-routes.ts` |
| テスト | `server/test/phase1201-1240.test.ts` |
| ステータス | `docs/phase1201_1240_status.md` |

### tisly.jp 公開前に必要な手順

1. `server/.env` を `.env.example` から作成し、**必須項目**を設定（下表）
2. `cd server && npm run build && npx tsc --noEmit && npm run test`
3. VPS へデプロイ（`docs/tisly_jp_deploy_runbook.md`）
4. Let's Encrypt SSL · nginx · systemd 常駐
5. `docs/rc2_pre_deploy_checklist.md` の URL / API を人手確認
6. 初回は **mock 維持**（`MQTT_MODE` `SHELLY_MODE` `QNAP_UPLOAD_MODE` `GMAIL_SEND_MODE`）

| 人間が設定する .env（必須） | 生成例 |
|-----------------------------|--------|
| `JWT_SECRET` | `openssl rand -hex 32` |
| `ADMIN_PASSWORD_HASH` | `npm run hash:admin-password` — [`docs/admin-password-recovery.md`](docs/admin-password-recovery.md) |
| `TISLY_PUBLIC_URL` | `https://tisly.jp` |
| `INGEST_SECRET` | `openssl rand -hex 24` |
| `NODE_ENV` | `production` |

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

---

## TiSLY Platform — Field Deployment RC2 / First Real Customer Trial（Phase 1161–1200）

**初回顧客導入トライアル — 1案件を最初から最後まで追える RC2**

| 領域 | パス / API |
|------|------------|
| Field Project Wizard | `/field/new` · `POST /api/field/projects/create` · `GET /api/field/projects/:id` |
| AI現調解析 v2 | `POST /api/ai/survey-analysis-v2` |
| 見積ドラフト v2 | `/business/projects/:id/estimate-draft` · `POST/PATCH /api/business/.../estimate-draft` |
| Deployment Checklist RC2 | `/deployment/checklist/:projectId` · `GET/POST /api/deployment/checklist/*` |
| PRO Remote Floor Stack RC2 | `GET /api/customer/:code/pro-remote/floor-stack?rc=2` · `POST .../focus` |
| Google TV Focus RC2 | `/tv/:code` · `POST /api/tv/focus-camera` · `GET /api/tv/:code/state` |
| Customer Handover | `/customer/:code/handover` · `GET /api/customer/:code/handover` |
| テスト | `server/test/phase1161-1200.test.ts` |
| ドキュメント | `docs/phase1161_1200_status.md` · `docs/first_customer_trial_runbook.md` |

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

---

## TiSLY Platform — Field Deployment RC1 & Operations Automation（Phase 1121–1160）

**初回導入可能レベル — 営業→現調→見積→施工→引渡し→保守の統合ワークフロー**

| 領域 | パス / API |
|------|------------|
| 現調PWA強化 | `/survey` · `POST /api/survey/photo` · `/audio` · `/drawing` · GPS逆引き |
| AI現調解析 v4 | `POST /api/ai/survey-analysis` |
| TOMS見積自動生成 | `POST /api/business/estimate/generate` |
| QR資産管理 | `POST /api/assets/qr/create` · `GET /api/assets/qr/history` |
| 保守PWA | `/maintenance` · `GET/POST /api/maintenance/schedule` · `POST /api/maintenance/report` |
| 顧客ポータル v1 | `/customer-portal` · `GET /api/customer/:code/field-view` (owner) |
| 統合タイムライン | `GET /api/timeline` |
| 案件司令塔 RC | `/project/:id` · `GET /api/toms/projects/:id/dashboard?rc=1` |
| Google TV focus | `POST /api/tv/focus-camera` |
| テスト | `server/test/phase1121-1160.test.ts` |
| ドキュメント | `docs/phase1121_1160_status.md` |

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

---

## TiSLY Platform — Production Device Connection & Onboarding（Phase 1041–1080）

**実機接続準備 · Shelly プロビジョニング · 施工 PWA ファイナライズ · 顧客オンボーディング一括化**

| 領域 | パス / API |
|------|------------|
| MQTT 接続チェック | `MQTT_MODE=mock\|real` · `GET /api/deployment/mqtt/status` |
| MQTT heartbeat テスト | `POST /api/deployment/mqtt/test-heartbeat` |
| Shelly 登録 | `SHELLY_MODE=mock\|real` · `POST /api/shelly/register` |
| Shelly テスト | `POST /api/shelly/test` |
| 施工 PWA 強化 | `/customer/:code/install/home` · 8項目チェックリスト |
| 新規導入ウィザード | `/onboarding/new` · `POST /api/customer-onboarding/create` |
| テスト | `deployment-mqtt.test.ts` · `shelly-provisioning.test.ts` · `customer-onboarding.test.ts` · `installer-finalize.test.ts` |
| ドキュメント | `docs/phase1041_1080_status.md` · `docs/mqtt_real_connection.md` · `docs/shelly_gen3_provisioning.md` · `docs/customer_onboarding_runbook.md` |

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

---

## TiSLY Platform — First Customer Deployment Kit（Phase 1001–1040）

**初回導入キット — 営業デモではなく実案件運用を開始できる状態**

| 領域 | パス / API |
|------|------------|
| 顧客登録 | `/customer/new` · `POST /api/deployment-kit/customers/wizard` |
| 現場作成 | `/site/new` · `POST /api/deployment-kit/sites/wizard` |
| 設備登録 | `/device/provision` · `POST /api/deployment-kit/devices/provision` |
| QR管理 | `/asset/:assetId` · `GET /api/deployment-kit/assets/:id` |
| 施工強化 | `POST /api/deployment-kit/install/step` |
| 保守案件 | `/customer/:code/deploy` · `/api/deployment-kit/maintenance/*` |
| 引渡し資料 | `GET /api/deployment-kit/package/:code/pdf` |
| 導入チェック | `/deployment/checklist` |
| KPI | `GET /api/deployment-kit/kpi` · `/api/dashboard` |
| テスト | `server/test/deployment-kit.test.ts` |
| ドキュメント | `docs/phase1001_1040_status.md` |

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

---

## TiSLY Platform — Live Device Bridge & Sales Ready RC1（Phase 901–940）

**mock↔実機 ESP/Shelly · デバイス Registry · 営業デモ RC1 · ROI v2 · 展示会ムービー**

| 領域 | パス / API |
|------|------------|
| 営業トップ | `/sales` — Mock / Real / Mixed 切替 · ROI · デモムービー |
| デバイス一覧 | `/devices` · `GET /api/demo-kit/devices/registry` |
| 接続モード | `GET/PUT /api/demo-kit/device-mode` |
| Shelly 実機 | `PUT /api/demo-kit/shelly/config` · `GET .../telemetry/:id` |
| 図面ライブ | `/sales/floor-preview` · `GET /api/demo-kit/floor-preview-live/:code` |
| ワンクリックデモ | `POST /api/demo-kit/demo-packages/{house,minpaku,...}/launch` |
| ROI v2 | `POST /api/demo-kit/roi-simulator` |
| デモムービー | `POST /api/demo-kit/demo-movie/start` |
| テスト | `server/test/business-phase901.test.ts` |
| ドキュメント | `docs/phase901_940_status.md` |

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

---

## TiSLY Platform — Production Real Connection & Reliability（Phase 781–820）

**MQTT TLS · Gmail DLQ · QNAP差分同期 · AI週次バッチ · WS再接続 · PDF回帰 · 共通状態バッジ**

| 領域 | パス / API |
|------|------------|
| MQTT TLS | `MQTT_TLS_ENABLED` · `docs/mqtt_tls_client_cert.md` |
| Gmail DLQ | `GET /api/business/gmail/dlq` |
| QNAP diff | `POST /api/business/qnap/sync-diff` |
| AI weekly | `GET /api/toms/ai-feedback/weekly-batch` |
| PRO WS | `docs/pro_remote_ws_reliability.md` · `pro_operations` |
| PDF regression | `docs/pdf_regression_pixelmatch.md` |
| 状態バッジ | `connection-badges.js` · Installer / Hub / Business |
| テスト | `server/test/business-phase781.test.ts` |
| ドキュメント | `docs/phase781_820_status.md` |

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

---

## TiSLY Platform — Real Connection & Operator Polish（Phase 741–780）

**MQTT 実接続 · Gmail retry worker · QNAP WebDAV · AI学習 · オフライン司令塔 · 双方向 WS · KPI CSV**

| 領域 | パス / API |
|------|------------|
| 接続状態 | `GET /api/toms/live/connection-status` |
| MQTT bridge | `docs/mqtt_live_push_bridge.md` · `LIVE_OPS_MOCK_PUSH=false` |
| Gmail worker | `docs/gmail_oauth_retry_worker.md` · `GET /api/toms/gmail-send-queue` |
| QNAP real | `docs/qnap_webdav_real_upload.md` · `QNAP_UPLOAD_MODE=real` |
| AI learning | `GET /api/toms/ai-feedback/learning` |
| Offline Hub | `docs/offline_snapshot.md` · IndexedDB |
| PRO Remote WS | `docs/pro_remote_bidirectional_ws.md` |
| KPI CSV | `GET /api/toms/kpi/csv` · `GET /api/toms/customer-master/:id/kpi/csv` |
| テスト | `server/test/business-phase741.test.ts` |
| ドキュメント | `docs/phase741_780_status.md` |

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

---

## TiSLY Platform — Live Operations & PRO Remote Polish（Phase 701–740）

**WebSocket ライブ更新 · フロア自動ジャンプ · Gmail/QNAP 復旧キュー · PDF v1 · AI feedback · KPI 多テナント**

| 領域 | パス / API |
|------|------------|
| WebSocket | `wss://host/ws` · `GET /api/toms/live/ws-status` |
| 復旧キュー | `GET/POST .../retry-queue` · `/api/business/retry-queue` |
| AI feedback | `POST .../ai-estimate-v3/feedback` |
| PDF v1 | `docs/pdf_template_standard.md` · `TISLY_PDF_PUPPETEER=true` |
| PWA SW | `/service-worker.js` v701 · `docs/pwa_cache_strategy.md` |
| テスト | `server/test/business-phase701.test.ts` |
| ドキュメント | `docs/phase701_740_status.md` 他 |

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

---

## TiSLY Platform — Project Dashboard v2 & Command Center（Phase 661–700）

**毎日使う司令塔ダッシュボード · Floor Stack · ライブ設備 · 通知 · 保守 · KPI · CRM**

| 領域 | パス / API |
|------|------------|
| 案件司令塔 | `/project/:projectId` · `GET /api/toms/projects/:id/dashboard` |
| ライブ設備 | `GET /api/toms/projects/:id/devices/live` |
| 通知 | `GET/POST .../notifications` · ack |
| 保守 | `GET/POST .../maintenance` |
| 図面差分 | `GET .../drawing-diff` |
| KPI | `/business/kpi` · `GET /api/toms/kpi` |
| 顧客 CRM | `/customer-master/:customerId` |
| App Hub Today | `/app` — 拡張オペレーション KPI |
| テスト | `server/test/business-phase661.test.ts` |
| ドキュメント | `docs/phase661_700_status.md` 他 |

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

---

## TiSLY Platform — Multi PWA App Hub & Role Based Navigation（Phase 461–480）

**App Hub · ロール別 PWA 表示 · Survey/保守/PRO Remote/顧客ポータル manifest · 共通 App Shell**

| 領域 | パス / URL |
|------|------------|
| App Hub | `/app` |
| PWA Hub API | `GET /api/pwa/hub` · `GET /api/pwa/access/:pwaId` |
| 施工 PWA | `/customer/:code/install/home` |
| 現調 PWA | `/survey` |
| 保守 PWA | `/maintenance` |
| PRO Remote PWA | `/customer/:code/pro-remote` · `manifest-pro-remote.webmanifest` |
| 顧客ポータル PWA | `/customer/:code` · `manifest-customer.webmanifest` |
| 共通 Shell | `js/tisly-pwa-shell.js` · `css/tisly-pwa-shell.css` |
| Service Worker | `/service-worker.js`（v461） |
| ロール | `installer` · `surveyor` · `maintenance` · `viewer` · `admin` |
| テスト | `server/test/multi-pwa-app-hub.test.ts` |
| ドキュメント | `docs/phase461_480_status.md` · `docs/pwa_role_navigation.md` |

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
```

---

## TiSLY Platform — Installer Only PWA & Survey Placeholder（Phase 441–460）

**施工員専用 PWA App Shell · iPhone/Android 対応 · 権限制限 · Survey 入口**

| 領域 | パス / URL |
|------|------------|
| 施工 PWA | `/customer/:code/install` |
| 施工ホーム | `/customer/:code/install/home` |
| インストール手順 | `/customer/:code/install/guide` |
| Manifest（顧客別） | `/customer/:code/install/manifest.webmanifest` |
| Service Worker | `/service-worker.js`（v441） |
| オフライン fallback | `/offline` |
| Survey placeholder | `/survey` |
| PWA アイコン | `server/public/icons/icon-192.png` · `icon-512.png` |
| 権限ガード | `server/src/auth/installer-restricted-guard.ts` |
| PWA 戦略 | `docs/tisly_pwa_strategy.md` |
| iOS / Android 手順 | `docs/ios_pwa_install_guide.md` · `docs/android_pwa_install_guide.md` |
| テスト | `server/test/pwa-installer.test.ts` |
| ドキュメント | `docs/phase441_460_status.md` |

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
node server/scripts/gen-pwa-icons.mjs   # アイコン再生成時
```

---

## TiSLY Platform — First Device Commissioning & Demo Kit（Phase 421–440）

**実機1台接続 · Device State · Heartbeat Monitor · Map/TV Live · Demo Kit · Health Dashboard**

| 領域 | パス / URL |
|------|------------|
| First Device Wizard | `/customer/:code/install/device-onboard` |
| Device Status | `UNKNOWN` / `ONLINE` / `OFFLINE` / `WARNING` / `COMMISSIONING` |
| Heartbeat Monitor | `server/src/device/device-heartbeat.ts`（5分 WARNING / 15分 OFFLINE） |
| Device Timeline | `GET /api/customer/:code/devices/timeline` |
| Map Live | `GET /api/customer/:code/map/live` · 緑/黄/赤ピン |
| TV Device Health | `/tv/:code` · `deviceHealth` in TV API |
| Demo Kit | `docs/demo_kit_v1.md` · 顧客 `DEMO001` / `DEMO-HOUSE` |
| Demo Mode | `DEMO_MODE=true` または `TISLY_DEMO_MODE=true` |
| Simulator | `POST /api/customer/:code/simulator/event` |
| Notification Test | `POST /api/customer/:code/notifications/test-all` |
| Provisioning Report PDF | `GET .../devices/:id/provisioning-report?format=pdf` |
| Health Dashboard | `/customer/:code/health` |
| テスト | `device-onboarding.test.ts` · `device-heartbeat.test.ts` · `device-map-live.test.ts` · `demo-mode.test.ts` |

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
```

---

## TiSLY Platform — Field Device Live Connection（Phase 401–420）

**実機接続準備 · MQTT ACK · ファーム設定 · ラベル印刷 CSV · 施工写真本番 · 完了レポート EN**

| 領域 | パス / URL |
|------|------------|
| Field モード | `FIELD_LIVE_MODE` · `GET .../install/field-live-status` |
| Live MQTT ACK | `POST .../devices/:id/test/live-mqtt` · `server/src/mqtt/ack-tracker.ts` |
| Firmware config | `GET .../devices/:id/firmware-config` |
| ラベル | `labels/tepra.csv` · `labels/brother.csv` · `qr.svg` |
| 完了レポート | `?locale=ja` · `?locale=en` |
| 施工写真 | `before` / `after` / `wiring` / `device_label` / `panel` / `test_result` |
| SW 同期 UI | pending / synced / failed / conflict |
| ランブック | `docs/first_real_device_connection_runbook.md` |
| チェックリスト | `docs/installer_final_checklist.md` |
| テスト | `server/test/field-live-connection.test.ts` |
| ドキュメント | `docs/phase401_420_status.md` |

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
```

---

## TiSLY Platform — Field Installer Production Sync（Phase 381–400）

**Service Worker同期 · 実MQTT RTT · CSR/証明書 · 施工写真 · 多言語 · Dashboard**

| 領域 | パス / URL |
|------|------------|
| Service Worker | `server/public/service-worker.js` · `docs/service_worker_offline_sync.md` |
| オフライン同期 | `POST .../install/sync` · Offline Status バー |
| MQTT RTT | `POST .../devices/:id/test/mqtt-rtt`（`rtt_ms`, `broker_status`） |
| CSR / 証明書 | `POST .../csr` · `.../cert/issue` · `docs/device_certificate_pipeline.md` |
| 施工写真 | `POST/GET/DELETE .../install/photos` |
| ストレージ | `STORAGE_PROVIDER` · `server/src/storage/s3-client.ts` |
| 多言語 | `installer-i18n.js` · ja/en |
| Dashboard | `GET .../install/dashboard` |
| ラベル | `labels.csv` · `label.svg` · `label.json` |
| テスト | `server/test/installer-production-sync.test.ts` |
| ドキュメント | `docs/phase381_400_status.md` |

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
```

---

## TiSLY Platform — Field Installer Hardening（Phase 361–380）

**QRカメラ · オフライン同期 · 完了PDF · ラベルCSV · MQTT RTT · mTLS準備 · Dry Run · 施工セッション**

| 領域 | パス / URL |
|------|------------|
| QR カメラ | 施工 PWA QR タブ · `docs/qr_camera_scan.md` |
| オフライン同期 | `POST .../install/sync` · `docs/offline_conflict_resolution.md` |
| 完了レポート | `GET .../install/completion-report?format=html\|pdf` |
| ラベル | `GET .../devices/labels.csv` · `.../:id/label.svg` |
| MQTT RTT | `POST .../devices/:id/test/mqtt-rtt` |
| mTLS placeholder | `server/src/provisioning/device-certificates.ts` |
| Dry Run | ヘッダ `X-TiSLY-Dry-Run: 1` |
| 施工セッション | `POST .../install/session/start\|complete` |
| Map Undo/Redo | `/customer/:code/map` |
| テスト | `server/test/installer-field-hardening.test.ts` |
| ドキュメント | `docs/phase361_380_status.md` |

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
```

---

## TiSLY Platform — Installer PWA, QR/NFC & Field Setup（Phase 341–360）

**施工 PWA · QR プロビジョニング · NFC placeholder · Commissioning · MQTT 診断 · チェックリスト**

| 領域 | パス / URL |
|------|------------|
| 施工 PWA | `/customer/TOMS001/install` |
| QR API | `POST .../devices/qr/create` · `.../claim` |
| NFC API | `POST .../devices/nfc/claim` |
| チェックリスト | `GET/POST .../install/checklist` |
| 疎通テスト | `POST .../devices/:id/test/{heartbeat,event,relay,notification}` |
| MQTT 診断 | `GET .../install/mqtt/:deviceId` |
| 図面 QNAP | `POST .../floorplans/:id/archive` |
| ラベル | `GET .../devices/:id/label` |
| 完了レポート | `GET .../install/completion-report` |
| installer ロール | `toms001.installer` 等 |
| テスト | `server/test/installer-provisioning.test.ts` |
| ドキュメント | `docs/phase341_360_status.md` · `docs/installer_pwa.md` |

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
```

---

## TiSLY Platform — Site Builder, Map Editor & Deployment Foundation（Phase 321–340）

**営業・施工向けノーコード設定 · 図面配置 · カメラ/TV 登録 · Recovery/Schedule GUI**

| 領域 | パス / URL |
|------|------------|
| Site Builder | `server/src/site-builder/` |
| 管理 API | `GET/POST /api/site` · `/api/floor` · `/api/zone` · `/api/map` |
| 顧客 Map API | `GET/POST/PUT /api/customer/:code/map/devices` |
| 図面 Upload | `POST /api/customer/:code/floors/upload` → `uploads/floorplans` |
| Map Editor | `/customer/TOMS001/map` |
| 施工モード | `/customer/TOMS001/install` |
| 顧客ウィザード | `POST /api/customers/wizard` |
| カメラ/TV | `camera_devices` · `tv_devices.cert_status` |
| スケジュール | `customer_schedules` · Armed/Business/Night |
| Recovery GUI | `customer_recovery_rules` |
| PostgreSQL | `server/src/db/postgres/schema-phase-321.postgres.sql` |
| テスト | `server/test/site-builder.test.ts` |
| ドキュメント | `docs/phase321_340_status.md` |

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
```

---

## TiSLY Platform — Billing, Workers & Real Operations（Phase 301–320）

**Stripe 請求準備 · 配信ワーカー · Operations 実データ · PostgreSQL 移行 Runbook · 契約ガード**

| 領域 | パス / URL |
|------|------------|
| Stripe Billing | `server/src/billing/` · `POST /api/billing/stripe/webhook` |
| 管理 Billing タブ | `/admin/TOMS001` — 請求 placeholder |
| ワーカー | `server/src/workers/` · `WORKERS_ENABLED` |
| Webhook 再送 | `webhook-retry-queue.ts` · `GET/POST .../webhooks/deliveries` |
| レポートメールキュー | `report-email-queue.ts` · `POST .../reports/send-email` |
| Operations 実データ | `GET /api/ops/map|alarms|devices|tv|qnap?customerCode=` |
| 地図ビルダー | `server/src/ops/map-builder.ts` |
| 契約ガード | `server/src/customer/contract-guard.ts` |
| ポータル Audit | `/customer/TOMS001` タブ Audit |
| PostgreSQL 移行 | `docs/postgres_migration_runbook.md` |
| テスト | `server/test/billing-worker.test.ts` |
| ドキュメント | `docs/phase301_320_status.md` |

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
```

---

## TiSLY Platform — PRO Remote Unified Operations（Phase 281–300）

**顧客通知ルール · Incidents 統一 · Operations 顧客スコープ · PDF/メールレポート · RLS 準備 · Webhook 署名/再送 · TV ピン留め**

| 領域 | パス / URL |
|------|------------|
| 通知ルール UI | `/customer/TOMS001` タブ「通知ルール」 · `GET/POST /api/customer/:code/notification-rules` |
| プラン連動 | `server/src/notification/customer-rule-engine.ts` · Webhook/QNAP は PRO_REMOTE のみ |
| Incidents 統一 | `server/src/incidents/` · `recovery_incidents` → `incidents` クエリ |
| Operations スコープ | `/operations` · `GET /api/ops/summary?customerCode=` |
| PDF レポート | `server/src/reports/pdf/` · `TISLY_PDF_PUPPETEER=true` で Puppeteer |
| メールレポート | `POST /api/customer/:code/reports/send-email` |
| PostgreSQL RLS | `server/src/db/postgres/rls.sql`（適用は TODO） |
| 顧客コンテキスト | `server/src/auth/customer-context.ts` |
| Webhook 署名 | `x-tisly-webhook-timestamp` · `x-tisly-webhook-signature` |
| Webhook 再送 | `webhook_delivery_logs` · `webhook-retry-queue.ts` |
| 招待メール | `server/src/customer/invite-email-template.ts` |
| テスト | `server/test/pro-remote-operations.test.ts` |
| ドキュメント | `docs/phase281_300_status.md` · `docs/pro_remote_operations.md` |

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
```

---

## TiSLY Platform — PRO Remote Invite & Reporting（Phase 261–280）

**顧客招待・レポート出力・SOC/NOC 顧客スコープ・Webhook・サブドメイン設計**

| 領域 | パス / URL |
|------|------------|
| ユーザー招待 | `POST /api/customer/:code/users/invite` · `accept-invite` |
| ポータル Users タブ | `/customer/TOMS001` — 一覧・招待・ロール・停止 |
| レポート | `GET .../reports/monthly` · `weekly` · `POST .../reports/export` |
| QNAP レポート | `/TiSLY/{code}/{site}/reports/YYYY/MM/`（mock 可） |
| サブドメイン | `server/src/customer/subdomain-resolver.ts` · `deploy/nginx/customer-subdomains.conf` |
| SOC/NOC | `/operations` Customer Scope · `GET /api/incidents` |
| Webhook | `POST /api/customer/:code/webhooks`（PRO_REMOTE のみ） |
| 通知プラン | `server/src/notification/channel-plan-guard.ts` |
| PostgreSQL RLS | 設計のみ `docs/postgres_rls_tenant_isolation.md` |
| テスト | `server/test/customer-invite.test.ts` |

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
```

---

## TiSLY Platform — PRO Remote Production（Phase 241–260）

**テナント分離強化・顧客ポータル UX・プラン制限・ブランディング・顧客別 TV・営業レポート・ログインロックアウト**

| 領域 | パス / URL |
|------|------------|
| テナントガード | `server/src/auth/tenant-guard.ts` |
| プラン制限 | `server/src/customer/plan-guard.ts` |
| 顧客ポータル | `/customer/TOMS001` — 現場・警報・AI・Recovery |
| 顧客別 TV | `/tv/TOMS001` — 15s / 警報 10s 全画面 |
| 営業レポート | `GET /api/customer/:code/sales-report` |
| ロール | owner / admin / manager / viewer — `docs/customer_roles.md` |
| ドキュメント | `docs/pro_remote_customer_operations.md` · `docs/plan_feature_matrix.md` |
| テスト | `server/test/customer-tenant.test.ts` |

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
# デモ: toms001.viewer / demo-remote-2026
```

---

## TiSLY Platform — PRO Remote（Phase 221–240）

**顧客管理・マルチテナント・顧客別 URL・RBAC・Google TV Web ダッシュボード・Infrastructure 統合ヘルス**

| 領域 | パス / URL |
|------|------------|
| 顧客 DB | `server/src/db/schema-phase-221.sql` · `customers` / `customer_branding` / `customer_users` |
| 顧客 API | `GET /api/customers` · `POST /api/auth/customer/login` |
| 顧客ポータル | `/customer` · `/customer/TOMS001` |
| Google TV Web | `/tv/TOMS001`（全画面・15秒更新・アラート10秒） |
| 顧客管理 UI | `/admin/TOMS001` |
| Infrastructure | `/operations` · `GET /api/health/full` |
| ドキュメント | `docs/phase221-240_pro_remote.md` · `docs/er_phase221.md` |
| テスト | `server/test/customer.test.ts` · `health.test.ts` |

```bash
cd server && npm install && npm run build && npm run test
# 顧客ログイン例: toms001.viewer / demo-remote-2026
# http://localhost:3080/customer/TOMS001
# http://localhost:3080/tv/TOMS001
```

---

## TiSLY Platform — Production Infrastructure Foundation（Phase 201–220）

**VPS 投入前提の本番基盤** — PostgreSQL Pool、Redis、本番 2FA（otplib）、SIEM マルチプロバイダ、TV 証明書プレースホルダ、Infrastructure ヘルス。

| 領域 | パス / URL |
|------|------------|
| PostgreSQL | `server/src/db/postgres/` · `GET /api/db/status` |
| SQLite→PG 移行 | `npm run migrate:sqlite-to-postgres` |
| Redis | `server/src/redis/` · `RATE_LIMIT_PROVIDER=redis` |
| 2FA 本番 | `POST /api/auth/2fa/*` · `REQUIRE_2FA=true` |
| SIEM | `SIEM_PROVIDER=none\|loki\|elastic\|syslog` |
| TV Security | `docs/tv_security.md` |
| Infrastructure | `/operations` Infrastructure タブ · `/api/health` |
| テスト | `server/test/postgres.test.ts` · `redis.test.ts` · `2fa.test.ts` · `health.test.ts` |

```bash
cd server && npm install && npm run build && npm run test
cd tv-app && npx tsc --noEmit
# http://localhost:3080/operations — Infrastructure タブ
```

**VPS 投入前**: PostgreSQL / Redis / MQTT TLS / `REQUIRE_2FA` / SIEM エンドポイントを `.env` で設定。

---

## TiSLY Platform — Production Security & Database Foundation（Phase 181–200）

**Security Hardened RC1 → 本番運用基盤** — PostgreSQL 準備、ingest 冪等性、HMAC 署名、Replay 対策、Session revoke、2FA/SIEM/WAF 準備。

| 領域 | パス / URL |
|------|------------|
| DB Provider | `DB_PROVIDER=sqlite\|postgres` · `server/src/db/db-provider.ts` |
| PostgreSQL スキーマ | `server/src/db/postgres/` |
| DB CLI | `npm run db:migrate` · `db:status` · `db:backup` |
| Ingest 冪等 | `tenant+site+device+event_id` · 重複時 `200 duplicate:true` |
| HMAC 署名 | `x-tisly-signature` · `docs/event_signature.md` |
| Replay 対策 | `server/src/security/replay-protection.ts` |
| Redis 準備 | `RATE_LIMIT_PROVIDER=memory\|redis` |
| Session revoke | `GET/POST /api/auth/sessions` |
| 2FA 準備 | `POST /api/auth/2fa/*` · `docs/two_factor_auth.md` |
| SIEM Export | `data/siem/*.ndjson` · `docs/siem_log_format.md` |
| WAF/nginx | `server/deploy/nginx/security-snippets.conf` |
| TLS/OCSP | `docs/tls_ocsp_pinning.md` |
| インシデント対応 | `docs/security_incident_response.md` |
| PenTest | `docs/pentest_notes.md` |
| 本番チェックリスト | `docs/production_security_checklist.md` |
| テスト | `server/test/production-security.test.ts` |

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
# http://localhost:3080/operations — Security タブ（セッション・SIEM・DB provider）
```

**本番投入前**: `docs/production_security_checklist.md` をすべて確認。

---

## TiSLY Platform — Security Hardened RC1（Phase 161–180）

**営業デモ → 実証運用（安全寄り）** — 管理 API JWT 認証、device/ingest secret 検証、監査ログ強化、QNAP 保持・purge、バックアップ、レート制限。

| 領域 | パス / URL |
|------|------------|
| 管理者認証 | `POST /api/auth/login` · `JWT_SECRET` + `ADMIN_PASSWORD_HASH` |
| Device secret | ヘッダ `x-tisly-device-id` / `x-tisly-device-secret` |
| Ingest secret | ヘッダ `x-tisly-ingest-secret` · `POST /api/events/ingest` |
| Secret ローテーション | `docs/secret_rotation.md` |
| 監査ログ | `audit_logs` · `/operations` Security タブ |
| QNAP retention | `GET /api/qnap/retention` · `POST /api/qnap/purge` |
| バックアップ | `docs/backup_strategy.md` · `POST /api/security/backup/run` |
| MQTT TLS/ACL | `server/deploy/mosquitto/` · `docs/mqtt_security_acl_tls.md` |
| セキュリティチェックリスト | `docs/rc1_security_checklist.md` |
| PostgreSQL 移行準備 | `docs/postgresql_migration.md` |
| E2E + Security テスト | `server/test/e2e.test.ts` · `server/test/security.test.ts` |

```bash
cd server && npm run build && npm run test
# パスワードハッシュ生成（build 不要）:
# npm run hash:admin-password -- 'your-pass'
# http://localhost:3080/operations — Security タブでログイン
```

**本番投入前**: `docs/rc1_security_checklist.md` をすべて確認。

---

## TiSLY Platform — RC1 Production Candidate（Phase 141–160）

**営業デモ → 実証運用** — 現場プロビジョニング、PWA セットアップウィザード、Recovery Console、マルチ現場/顧客、運用レポート。

| 領域 | パス / URL |
|------|------------|
| Site Provisioning | `server/src/provisioning/` · `POST /api/sites/create`（要認証） |
| テンプレート 7 種 | `GET /api/sites/templates` |
| Device + QR | `POST /api/provisioning/devices` · `/setup` |
| Recovery Console | `/recovery` · confirm 付き手動実行 |
| 運用レポート | `GET /api/reports/operations?format=csv\|json\|pdf`（export_id 記録） |
| RC1 チェックリスト | `docs/rc1_checklist.md` |
| 営業デモ Runbook | `docs/demo_runbook.md` |
| 本番前 TODO | `docs/production_todo.md` |

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
# http://localhost:3080/setup  — 初回ウィザード
# http://localhost:3080/operations
```

---

## TiSLY Platform — Production Device Connection（Phase 121–140）

**実機接続前の最終段階** — TV ペアリング、MQTT 実運用準備、QNAP SMB、PLC/RP2350/ESP 接続仕様。

| 領域 | パス / 内容 |
|------|-------------|
| TV ペアリング API | `server/src/api/routes/tv.ts` — `/api/tv/pairing/*` |
| TV アプリ | `tv-app/src/screens/PairingScreen.tsx` |
| MQTT Subscriber | `server/src/mqtt/`（mock + 本番 broker） |
| PLC Modbus | `server/src/plc/` — `docs/plc_modbus_map.md` |
| RP2350 GPIO | `rp2350/config/gpio_map.json` — `docs/rp2350_pin_verification.md` |
| ESP32 テンプレ | `esp32/config/*.example.json` — `docs/esp32_real_device_setup.md` |
| QNAP SMB | `server/src/qnap/smb-client.ts` — `docs/qnap_smb_archive.md` |
| MQTT セキュリティ | `docs/mqtt_security_acl_tls.md` |
| トピック移行 | `docs/mqtt_topic_migration.md` |
| 認証ローテーション | `docs/device_auth_rotation.md` |
| Node-RED | `node-red/tisly_real_device_ingest_v1.json` |
| E2E テスト | `server/test/e2e.test.ts` — `npm run test` |
| 本番チェックリスト | `docs/production_readiness_checklist.md` |

```bash
cd server && npm run build && npm run test
cd tv-app && npx tsc --noEmit
```

---

## TiSLY Platform — Real Device Integration（Phase 101–120）

**実機統合準備** — 実機がなくても営業デモ可能。実機到着後すぐ接続・検証できる状態を整備。

| 対象 | パス / 内容 |
|------|-------------|
| 実機チェックリスト | `docs/real_device_integration_checklist.md` |
| デバイス ID ルール | `docs/device_id_rules.md` |
| 統一 MQTT | `docs/mqtt_unified_topics.md` |
| Node-RED ingest | `node-red/tisly_real_device_ingest_v1.json` |
| PLC 連携 | `docs/plc_integration.md` |
| ESP32 準備 | `esp32/TODO.md` |
| RP2350 準備 | `rp2350/TODO.md` |
| Google TV ペアリング設計 | `docs/google_tv_pairing.md` |
| PWA 実機デモ | `docs/pwa_real_demo.md` |
| 現場テンプレ | `docs/site_templates.md` |
| 営業デモ完成度 | `docs/sales_demo_readiness.md` |

### API（実機・デモ共通）

| API | 説明 |
|-----|------|
| `POST /api/devices/register` | デバイス登録（tenant/site/metadata） |
| `GET/PATCH /api/devices/:id` | 参照・更新 |
| `POST /api/devices/:id/test` | テストイベント送信 |
| `POST /api/devices/:id/restart-request` | 再起動要求記録 |
| `POST /api/test/*` | 実機なしスモーク（event/alarm/heartbeat/recovery/tv-alert） |
| `POST /api/qnap/archive/event` | イベント単体アーカイブ（mock 可） |
| `GET /api/qnap/status` | QNAP 連携状態 |

### 統一イベント + MQTT

```
tisly/{tenant_id}/{site_id}/{device_id}/{state|event|heartbeat|cmd|recovery}
```

Node-RED → `POST /api/events/ingest`（`INGEST_SECRET`）。詳細は `docs/unified_event_format.md`。

### 営業デモ確認手順

```bash
npm run build
npm run demo
# http://localhost:3080/operations
curl -X POST http://localhost:3080/api/test/alarm
curl http://localhost:3080/api/test/help
```

完成度チェック: `docs/sales_demo_readiness.md`

---

## TiSLY Platform — AI Analytics + Recovery（Phase 81–100）

TiSLY は次の進化段階に入りました。

| 段階 | 内容 |
|------|------|
| **Notification Platform** | Web Push / Discord / Email（Phase 21–60） |
| **Operations Platform** | デモ・運用コンソール・SOC/NOC（Phase 61–80） |
| **Recovery Platform** | AI 分析・自律復旧・QNAP・アーカイブ（Phase 81–100） |

**差別化:** AI Analytics + Recovery Engine + QNAP 連携

| 機能 | パス / URL |
|------|------------|
| AI Analytics Engine | `server/src/analytics/` |
| Recovery Engine | `server/src/recovery/` |
| QNAP Integration | `server/src/qnap/` |
| Analytics 画面 | http://localhost:3080/analytics |
| 営業モード（AI分析） | http://localhost:3080/sales |
| API | `/api/analytics/*` `/api/recovery/*` `/api/qnap/*` `/api/ops/soc` `/api/ops/noc` |
| 設計ドキュメント | `docs/ai_analytics.md` `docs/recovery_engine.md` `docs/qnap_integration.md` `docs/soc_noc.md` |

```bash
npm run demo
# デモイベント → AI リスク算出 → Recovery タイムライン → 通知優先度調整
```

Google TV: ホームに **AI Risk** / **Critical (24h)** カード表示。

---

## TiSLY Platform — Demo & Operations（Phase 61–80）

**営業デモ最優先**。実機未接続でも「TiSLYが動いている」状態を再現します。

| 機能 | パス / URL |
|------|------------|
| Demo Data Engine | `server/src/demo/` |
| 運用コンソール（マップ・Zone・デバイス・Alarm・Replay・Analytics・Health・カメラ） | http://localhost:3080/operations |
| デモ API | `/api/demo/*` |
| 営業デモ手順 | `docs/demo_sales_guide.md` |

### 営業デモ起動（推奨）

```bash
npm run demo
# 仮想現場5拠点・35仮想機器をシードし、30秒毎にイベント生成
# http://localhost:3080/  — ダッシュボード
# http://localhost:3080/operations — 運用コンソール
# http://localhost:3080/tv — TV 警報プレビュー（WebSocket）
cd tv-app && EXPO_PUBLIC_API_URL=http://<PC-IP>:3080 npx expo start
```

仮想現場: 守谷住宅 / 工場A / 倉庫A / 民泊A / 車屋A  
Google TV: 設定 → **Demo Mode** / **サイネージ**（Security・Facility・Factory・Hotel）

---

## TiSLY Notification Platform + Google TV（Phase 41–60）

**ConoHa VPS + tisly.jp** 本番化準備フェーズ。通知は VPS に統一。スマホは **PWA（Web Push）**、**Google TV のみ**ネイティブアプリ。  
MQTT は **VPS 内部のみ**。Node-RED は **HTTP ingest**（`POST /api/events/ingest`）で server へ渡す。

| ドキュメント | 内容 |
|-------------|------|
| `docs/vps_production_deploy.md` | VPS デプロイ手順 |
| `docs/web_push_setup.md` | VAPID / PWA Push |
| `docs/node_red_http_ingest.md` | Node-RED → server |
| `docs/unified_event_format.md` | 統一イベント JSON |
| `docs/security_baseline.md` | セキュリティ基準 |
| `docs/demo_sales_guide.md` | 営業デモ手順（Phase 61–80） |

### ローカル確認（実機連携前）

```bash
cd server && cp .env.example .env && npm install && npm run db:init && npm run build && npm run dev
# http://localhost:3080/  — Push 登録・/tv WebSocket プレビュー
cd tv-app && npm install && npx expo start
# EXPO_PUBLIC_MQTT_MOCK=true で WS なし開発可
```

---

## TiSLY Notification Platform（Phase 21–40 基盤）

通知は **ConoHa VPS / tisly.jp** に統一。スマホは **PWA**、**Google TV のみ**ネイティブアプリ。

| コンポーネント | パス |
|---------------|------|
| 通知コア | `server/notification/notification-service.ts` |
| tisly.jp API + 管理 UI | `server/` |
| PWA | `server/public/` |
| Google TV App | `tv-app/` |
| 設計ドキュメント | `docs/notification_architecture.md` 他 |

### 通知構成図

```
[ESP / RP2350 / PLC] → MQTT (VPS) → Node-RED
                          ↓
              notification-service.ts
                          ↓
            Web Push | Discord | Email
                          ↓
                 PWA (スマホ) / TV App
```

### Google TV 構成図

```
tv-app (Expo RN)
  Home ─┬─ Security / Events / Status
        ├─ Cameras (将来 RTSP/WebRTC)
        └─ Settings (キオスク)
              ↕ HTTPS
         tisly.jp /api/*
```

起動: `cd server && npm install && npm run dev` → http://localhost:3080/

---

## プロジェクト構成

```
TiSLY_HOME_Security_DEMO/
├── README.md
├── server/          … 通知 + AI Analytics + Recovery + PWA + 実機 API
├── tv-app/          … Google TV ネイティブ（Risk / Critical 表示）
├── docs/            … 実機統合・MQTT・PLC・PWA・営業デモ 他
├── node-red/        … tisly_real_device_ingest_v1.json
├── esp32/           … 実機差し替え TODO
├── rp2350/          … RP2350 Edition
└── ladder/
    ├── TiSLY_HOME_Security_DEMO.txt         … 命令語リスト (IL) + 段コメント
    └── TiSLY_HOME_Security_DEMO_LADDER.txt  … ラダー図テキスト参考
```

## I/O 割り当て表

### 入力 (X)

| デバイス | 名称 | 用途 | 備考 |
|---------|------|------|------|
| X0 | セレクタスイッチ | 警戒 ON/OFF | ON = 警戒開始 |
| X1 | 非常停止ボタン | 全停止 | ON = 停止要求 (押下) |
| X2 | ビームセンサー 1 | 外周検知 | 警戒中に検知 → 外周警報 |
| X3 | ビームセンサー 2 | 近接検知 | 警戒中に検知 → 近接警報 |

### 出力 (Y)

| デバイス | 名称 | 電源 | 動作 |
|---------|------|------|------|
| Y0 | 赤ライト | 24V | 警戒中: 低速点滅 / 近接警報: 高速点滅 |
| Y1 | 白ライト 1 | 100V | 外周警報: 常時点灯 |
| Y2 | 白ライト 2 | 100V | 外周警報: 1 秒点滅 |
| Y3 | 白ライト 3 | 100V | 近接警報: 常時点灯 |
| Y4 | 白ライト 4 | 100V | 近接警報: 常時点灯 |

### 内部リレー (M)

| デバイス | 名称 | 説明 |
|---------|------|------|
| M0 | 警戒中 | セレクタ ON で SET、OFF/非常停止で RST |
| M1 | センサー1 警報保持 | 外周検知ラッチ |
| M2 | センサー2 警報保持 | 近接検知ラッチ |
| M10 | 低速点滅用 | テンプレート拡張用 (予約) |
| M11 | 高速点滅用 | テンプレート拡張用 (予約) |
| M20 | Y0 制御 | 赤ライト出力前段 (二重コイル回避) |

### 特殊補助リレー

| デバイス | 周期 | 用途 |
|---------|------|------|
| M8013 | 1 秒 (0.5s ON/OFF) | 警戒時 Y0 低速点滅、Y2 点滅 |
| M8012 | 0.1 秒 (0.05s ON/OFF) | 近接警報時 Y0 高速点滅 |

---

## 動作説明

### 基本フロー

1. **警戒開始** … X0 (セレクタ) を ON → M0 (警戒中) が SET される。
2. **警戒中** … Y0 (赤ライト) が M8013 により **1 秒周期** でゆっくり点滅する。
3. **外周検知** … 警戒中に X2 が ON → M1 が SET (保持)。Y1 常灯、Y2 が 1 秒点滅。
4. **近接検知** … 警戒中に X3 が ON → M2 が SET (保持)。Y3・Y4 常灯、Y0 は **高速点滅** に切り替わる。
5. **警報解除** … X0 を OFF、または X1 (非常停止) を ON → M0/M1/M2 リセット、全出力 OFF。

### 状態別の出力イメージ

| 状態 | Y0 赤 | Y1 | Y2 | Y3 | Y4 |
|------|-------|----|----|----|-----|
| 停止 (X0 OFF) | OFF | OFF | OFF | OFF | OFF |
| 警戒中 (M0) | 1s 点滅 | OFF | OFF | OFF | OFF |
| 外周警報 (M1) | 1s 点滅* | ON | 1s 点滅 | OFF | OFF |
| 近接警報 (M2) | **0.1s 点滅** | ※ | ※ | ON | ON |
| 非常停止 (X1) | OFF | OFF | OFF | OFF | OFF |

\* M2 が ON の場合、Y0 は近接警報の高速点滅が最優先。  
※ M1 と M2 は独立保持のため、両方 ON の場合は各出力条件が OR 的に重なる。

### Y0 優先度

```
非常停止 (X1)  >  近接警報 M2 (高速)  >  警戒中 M0 (低速)  >  OFF
```

Y0 は内部リレー **M20** を経由して **単一コイル** で出力します。二重コイルは使用していません。

---

## 各シーンの動き (デモ説明用)

### 1. 警戒中

- オペレータがセレクタ (X0) を ON。
- 赤ライト (Y0) が **約 1 秒周期** で点滅 → 「監視中」が一目で分かる。
- 白ライト 4 回路はすべて OFF。

### 2. 外周検知 (ビームセンサー 1)

- 警戒中に X2 が遮断 → M1 がラッチ。
- Y1 (白 1) **常時点灯** … 外周で異常。
- Y2 (白 2) **1 秒点滅** … 注意喚起。
- Y0 は引き続き低速点滅 (M2 が OFF の場合)。

### 3. 近接検知 (ビームセンサー 2)

- 警戒中に X3 が遮断 → M2 がラッチ。
- Y3・Y4 (白 3・4) **常時点灯** … 侵入レベル。
- Y0 が **0.1 秒周期の高速点滅** に切り替わる → 最も危険な状態を強調。
- M0 による低速点滅より **M2 高速点滅が優先**。

### 4. 非常停止

- X1 を ON (ボタン押下)。
- M0 / M1 / M2 を即リセット。
- Y0～Y4 をすべて OFF → 安全側へ。

---

## 配線メモ

### 入力側

| 信号 | 推奨配線 | 注意 |
|------|---------|------|
| X0 セレクタ | 24V DC セレクタスイッチ → COM | ノーマル ON 運用 |
| X1 非常停止 | **b 接点 (NC)** 推奨 → 断線時も安全側 | 本プログラムは X1=ON で停止 |
| X2, X3 ビーム | センサー出力 (NPN/PNP) に合わせて COM 配線 | 遮光 = ON を想定 |

- 入力は FX ユニットの **漏電流・応答時間** に合わせてフィルタ (X0: 10ms 等) を GX Works で設定可能。
- 非常停止回路は **ハードウェア安全回路** (リレーインターロック等) と併用することを推奨。

### 出力側

| 出力 | 負荷 | 配線 |
|------|------|------|
| Y0 | 24V 赤ライト | トランジスタ/リレー出力 → 24V 電源 |
| Y1～Y4 | 100V 白ライト | **中継リレー必須** (PLC 直接 100V 不可) |

- 100V 白ライトは **外部リレーまたはコンタクタ** 経由で駆動する。
- 各リレーコイルに **フライバックダイオード** を付ける。
- 出力点数: Y0～Y4 = 5 点必要 (FX3U-16MR 以上などを選定)。

### 電源

- PLC: 100/200V AC または 24V DC (機種による)
- 入力回路: 24V DC
- Y0 負荷: 24V DC
- Y1～Y4 負荷: 100V AC (リレー経由)

---

## GX Works への取り込み手順

1. 新規プロジェクト作成 (例: `TiSLY_HOME_Security_DEMO`)
2. PLC 機種を FX3U / FX5U 等に設定
3. `ladder/TiSLY_HOME_Security_DEMO.txt` を参考にラダーを入力  
   - または IL リスト表示で命令語を貼り付け
4. 各 RUNG に `TiSLY_HOME_Security_DEMO_LADDER.txt` の段コメントを設定
5. シミュレータまたは実機で X0→X2→X3→X1 の順に動作確認

---

## 今後の連携前提 (ESP / Node-RED / TiSLY UI)

本 DEMO はスタンドアロン PLC ロジックですが、TiSLY 標準テンプレート化を見据えて以下を想定しています。

| レイヤ | 役割 | 連携案 |
|--------|------|--------|
| PLC (本プログラム) | リアルタイム制御・安全 | 最終出力とラッチ状態 |
| ESP32 等 | I/O 拡張・MQTT ゲートウェイ | X/Y のミラー、Modbus RTU/TCP |
| Node-RED | イベント連携・ログ | `armed` / `perimeter` / `intrusion` / `estop` トピック |
| TiSLY UI | ダッシュボード | 状態表示、履歴、リモート警戒 (将来) |

### 推奨 MQTT / 状態トピック (案)

```
tishly/home/security/state/armed      ← M0
tishly/home/security/state/perimeter  ← M1
tishly/home/security/state/intrusion  ← M2
tishly/home/security/state/estop      ← X1
tishly/home/security/event/alarm      ← 立上りイベント
```

### テンプレート化メモ

- 段 1～10 のコメント構造を TiSLY 標準ラダーテンプレートの見出しとして流用可能。
- M10 / M11 は Node-RED 側の点滅同期や UI アニメーション用に拡張予約。
- デバイス番号 (X0～X3, Y0～Y4) は `IO_ASSIGNMENT` マスタと共通化する。

---

## ライセンス / 注意

- デモ・評価用途のサンプルプログラムです。
- 実際のセキュリティ設備に適用する場合は、関連法規・安全規格に従い、ハードウェア安全回路を必ず設計してください。

---

**プロジェクト名:** TiSLY_HOME_Security_DEMO  
**バージョン:** 1.0.0  
**更新日:** 2026-06-03（Phase 101–120 実機統合準備）

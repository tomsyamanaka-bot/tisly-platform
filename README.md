# TiSLY_HOME_Security_DEMO

TiSLY HOME Security のデモ展示用 PLC ラダープログラムです。  
三菱電機 **FX 系** PLC と **GX Works2 / GX Works3** を想定しています。

## TiSLY Platform — RC1 Production Candidate（Phase 141–160）

**営業デモ → 実証運用** — 現場プロビジョニング、PWA セットアップウィザード、Recovery Console、マルチ現場/顧客、運用レポート。

| 領域 | パス / URL |
|------|------------|
| Site Provisioning | `server/src/provisioning/` · `POST /api/sites/create` |
| テンプレート 7 種 | `GET /api/sites/templates` |
| Device + QR | `POST /api/provisioning/devices` · `/setup` |
| Recovery Console | `/recovery` · `POST /api/recovery/actions` |
| 運用レポート | `GET /api/reports/operations?format=csv\|json\|pdf` |
| RC1 チェックリスト | `docs/rc1_checklist.md` |
| 営業デモ Runbook | `docs/demo_runbook.md` |
| 本番前 TODO | `docs/production_todo.md` |

```bash
cd server && npm run build && npm run test
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

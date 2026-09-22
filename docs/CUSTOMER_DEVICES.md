# TiSLY 顧客・機器マスター台帳（現場カルテ）

**最終更新:** 2026-09-21  
**対象:** 正規顧客 2 件（豊島邸 / 板橋自宅）+ テスター専用 1 件（`TESTER001`）  
**入口:** お客様 `https://tisly.jp/customer` · 社内 `https://tisly.jp/app`

---

## 0. AI / 開発者向け必須プロンプトルール（最優先）

今後、ユーザー指示に **顧客名（現場名）** が含まれる場合
（例: 「豊島邸」「板橋自宅」「TOYOSHIMA」「ITABASHI」等）は、
コード変更・障害解析・パラメータ調整の **前に必ず本ファイルを参照** し、
以下を特定してから作業すること。

1. `customerCode`（例: `TOYOSHIMA001` / `TOMS001`）
2. `homeSiteId` / `securitySiteId`
3. RP2350 の DI/DO（端子番号）と役割
4. 稼働パラメータ（点灯時間帯・秒数・デバウンス）
5. NVR / ドアホン等の周辺機器

**禁止:** 顧客名だけで別物件の端子・deviceId を推測して変更すること。  
**原則:** 本カルテ → ソース定数 → 実機ルール JSON の順で確認する。  
**入口固定:** 顧客 UI は `/customer`、社内は `/app` のみ。

参照ソースの正:
- `server/src/shared/customer/customer-tenant-profile-v1.ts`
- `server/src/shared/customer/customer-tenant-bindings-v1.ts`
- `rp2350/firmware/toyoshima_security.py`
- `rp2350/firmware/security_light.py`
- `server/src/home/home-security-rules-v1.ts`

---

## 1. 顧客一覧（正規 2 件 + テスター）

| 表示名 | customerCode | HOME siteId | Security siteId | 専用 UI |
|--------|--------------|-------------|-----------------|--------|
| 豊島邸 | `TOYOSHIMA001`（旧別名 `TOSHIMA001`→正規化） | `HOME-JP-TOYOSHIMA` | `SEC-JP-TOYOSHIMA-001` | 豊島ダッシュボード |
| 板橋自宅 | `TOMS001`（旧別名 `HOME001`→正規化） | `HOME-JP-ITABASHI-LIVE` | `SEC-JP-ITABASHI-LIVE` | 標準 Security Floor |
| テスターデモ（板橋） | `TESTER001`（板橋実機ミラー） | `HOME-JP-ITABASHI-LIVE` | `SEC-JP-ITABASHI-LIVE` | お客様 `/customer` 限定スコープ |

---

## 2. 豊島邸（TOYOSHIMA001）

### 2.1 識別子・通信

| 項目 | 値 |
|------|-----|
| 主装置 deviceId | `rp2350-toyoshima-main-01` |
| 子機 deviceId | `rp2350-toyoshima-detached-01` |
| ファーム TENANT_ID | `TOYOSHIMA001` |
| ファーム SITE_ID | `SEC-JP-TOYOSHIMA-001` |
| HOME_SITE_ID | `HOME-JP-TOYOSHIMA` |
| BUILDING | `main` / `detached` |
| H.View NVR | `192.168.10.50` · RTSP `rtsp://192.168.10.50:554` |
| API 基点 | `/api/home/v1/toyoshima` |
| Heartbeat | 300 秒（5 分）· オフライン判定 **5 分 30 秒** |

### 2.2 主装置（母屋 RP2350 8ch）

| 端子 | 役割 | 備考 |
|------|------|------|
| DI1 | 遠近ビーム 1 | `DI_BEAM_1=1` |
| DI2 | 遠近ビーム 2 | `DI_BEAM_2=2` |
| DO1 | 100V 防犯ライト 1 | 点灯時間帯のみ |
| DO2 | 100V 防犯ライト 2 | 点灯時間帯のみ |
| DO3 | 24V パトライト | **24h** 点滅（`PATLITE_BLINK_MS=500`） |

### 2.2.1 主装置 確定アサイン（遠近2段階・2026-09-21 追記）

既存 2.2 行は残す。運用の正は本表。
各リレー接点は **CR サージアブソーバー保護** を適用する。

| 端子 | 確定役割 | 備考 |
|------|----------|------|
| DI1 | 赤外線ビーム（遠・外周境界） | `DI_BEAM_FAR=1` · 24h Push「⚠️ 外周で接近検知」 |
| DI2 | 赤外線ビーム（近・建物アプローチ） | `DI_BEAM_NEAR=2` · 24h Push「🚨 建物至近で侵入検知！」 |
| DO1 | 100V 防犯ライト 1（主照明） | 夜間のみ · DI1 単独でも点灯 |
| DO2 | 100V 防犯ライト 2（増設投光器） | 夜間のみ · DI2 または DIRECT で点灯 |
| DO3 | 100V フラッシュライト（ストロボ・威嚇回転灯） | 夜間 · `flash_enabled` 時のみ · `flash_duration_sec` |

**遠近2段階ロジック（`security_mode`）**

| モード | 動作 |
|--------|------|
| `2STEP`（既定） | DI1→DO1 のみ / DI2→DO1+DO2 + DO3フラッシュ |
| `DIRECT` | DI1/DI2 とも DO1+DO2 + DO3フラッシュ |
| `SILENT` | 24h Push のみ（ライト・フラッシュ省略） |

| 項目 | 値 |
|------|-----|
| `light_schedule` | 18:00〜06:00（JST・既存と同一） |
| `light_duration_sec` | クラウド同期（既存 `lightingDurationSec`） |
| `flash_duration_sec` | 既定 15 秒 |
| `flash_enabled` | 既定 True |

### 2.2.2 実機DO直結キック（2026-09-21 追記）

既存 2.2 / 2.2.1 は残す。手動点灯は昼夜を無視する。

| 項目 | 値 |
|------|-----|
| 命令キュー | `GET /api/home/v1/toyoshima/command?deviceId=`（板橋 `/api/remote-test/command` とは分離） |
| 手動バイパス | 照明一括ON / ライト1 / ライト2 / フラッシュ威嚇テスト → 即時 DO ON |
| GPIO | CH1=GPIO17 / CH2=GPIO18 / CH3=GPIO19（Waveshare RO1〜RO3） |
| 極性 | HIGH=コイルON（DO青LED点灯）· `RO_ACTIVE_LOW=false` |
| `force_relay_test` | 既定 True。センサー連動も昼間にリレー可 |
| OTA | `main.py`←`main_toyoshima.py` · `config.py` は skipFiles |

### 2.2.3 即時リレーパイプライン（2026-09-21 追記）

既存 2.2 / 2.2.1 / 2.2.2 は残す。手動点灯は 2 秒以内に実機へ届ける。

| 項目 | 値 |
|------|-----|
| 長待ち GET | `GET /api/home/v1/toyoshima/command?deviceId=&waitMs=2000` |
| HB 同梱 | `POST /api/home/v1/toyoshima/heartbeat` 応答の `command` |
| PWA 通知 | WebSocket `type:event` · `topic:toyoshima/relay` |
| 実機ループ | waitMs=2000 + idle 300ms。WDT 8s 以内 |
| 手動バイパス | 昼夜・スケジュール無視。CH HIGH=コイルON（DO青LED） |

### 2.2.4 手動点灯 GPIO 明示キック（2026-09-21 追記）

既存 2.2 / 2.2.1 / 2.2.2 / 2.2.3 は残す。

| 項目 | 値 |
|------|-----|
| ライト1 | `do1_on` · channels `[1]` · GPIO17 HIGH |
| ライト2 | `do2_on` · channels `[2]` · GPIO18 HIGH |
| 一括ON | `bulk_on` · channels `[1,2,3]` · GPIO17/18/19 HIGH |
| PWA | `/customer` `/app` とも `data-ts-light-kick` document capture |
| OTA | `force:true` · `main.py`←`main_toyoshima.py` · `toyoshima_security.py` |

### 2.2.5 DI/DO 完全バインド（2026-09-22 追記）

既存 2.2 / 2.2.1 / 2.2.2 / 2.2.3 / 2.2.4 は残す。上書きしない。

| 項目 | 値 |
|------|-----|
| ロジック版 | `FIRMWARE_LOGIC_VERSION=1.2.2` · `OTA_VERSION=1.2.2` |
| DI サンプリング | メインループで `poll_inputs()` を HTTP より先に実行 |
| 命令待ち | `COMMAND_WAIT_MS=0` · `LOOP_IDLE_MS=50`（2秒長待ち廃止） |
| DI1 遠 | 立上りで **同期** CH1(DO1/GPIO17) HIGH · lightingDurationSec |
| DI2 近 | 立上りで **同期** CH1+CH2 HIGH + CH3 15秒点滅 |
| テストモード | `force_relay_test` 既定 True。昼間でもリレー駆動 |
| 手動 | `do1_on`/`do2_on`/`bulk_on`/`bulk_off`(CH1-3) · `sensor_far`/`sensor_near` |
| VPS バックアップ | `handleMainBeamDetect` が実機キューへ `sensor_far`/`sensor_near` を積む |
| OTA | クラウド最新はバンドル 1.2.2 を広告。ステージングにライブファイルをスナップショット |

### 2.2.6 手動 DO1/DO2/DO3 完全連動（2026-09-22 追記）

既存 2.2 / 2.2.1〜2.2.5 は残す。上書きしない。

| 項目 | 値 |
|------|-----|
| ロジック版 | `FIRMWARE_LOGIC_VERSION=1.2.3` |
| GPIO 極性 | HIGH=コイルON をファーム強制。`RO_ACTIVE_LOW` は無視 |
| ライト1 | `do1_on` → CH1/GPIO17 HIGH |
| ライト2 | `do2_on` → CH2/GPIO18 HIGH |
| 一括ON | `bulk_on` → CH1+CH2+CH3 / GPIO17+18+19 HIGH |
| 命令補完 | channels 欠落時もコマンド名から CH を推論 |
| PWA | `/customer` `/app` の外構ライト手動操作に一括ON/OFFを含む。session header 付き POST |
| OTA | クラウド最新 1.2.3 をステージング |

### 2.3 子機（はなれ RP2350 6ch）

| 端子 | 役割 | 備考 |
|------|------|------|
| DI1 | 道路側センサー | `DI_ROAD=1` |
| DI2 | 通路側センサー | `DI_PATH=2` |
| DO1 | 100V ライト | 点灯時間帯のみ |
| DO2 | パトライト | **24h** |
| DO3 | 予備 100V（ラベルのみ） | ファーム応答では未使用 |
| RS485 Modbus | **スレーブ ID:01（現場割当）** | はなれ側 RS485 機器の標準 ID。GPIO DI/DO 制御本体は `toyoshima_security.py` |

### 2.4 H.View NVR（CH）

| CH | id | ラベル |
|----|-----|--------|
| CH1 | `cam-main-gate` | 母屋 玄関カメラ |
| CH2 | `cam-det-road` | はなれ 道路側 |
| CH3 | `cam-det-path` | はなれ 通路側 |
| CH4 | （未割当） | 追加時は本表へ追記 |

RTSP: `{nvrRtspBase}/unicast/c{channel}/s1/live`

### 2.5 稼働パラメータ（既定）

| 項目 | 値 |
|------|-----|
| ライト点灯時間帯 | **18:00〜06:00（JST・日またぎ）** |
| guardMode（初回 merge） | `scheduled` |
| 点灯維持秒数 | **45 秒**（`lightingDurationSec` / `DEFAULT_OUTPUT_MS=45000`） |
| フラッシュ維持秒数 | **15 秒**（`flashDurationSec` / `DEFAULT_FLASH_MS=15000`） |
| 遠近モード | **2STEP**（`securityMode` · PWA 遠隔設定） |
| デバウンス | **100 ms**（`DI_DEBOUNCE_MS` / `diConfirmMs` / `debounceDi*` / `debounceBeamMs`） |
| 通知 | 24h（ライトのみ時間帯制限） |
| 日中挙動 | 母屋: 通知のみ（ライト・フラッシュ省略） / はなれ: 通知＋DO2パトライト |
| `force_relay_test` | **True**（テスト時は昼間でもセンサー連動リレー） |

### 2.6 Guard Viewer / EZCloud ライブ共有（方法A）

| 項目 | 値 |
|------|-----|
| `cloudStreamUrl` | （未設定 · プレースホルダー）Guard Viewer / EZCloud 共有プレビュー URL を登録 |
| `shareUrl` | `cloudStreamUrl` の別名（互換） |
| `nvrAppOpenUrl` | （任意）ネイティブアプリ起動 URL / ストアリンク |
| 埋め込み方式 | PWA `<iframe>` / HLS（`.m3u8`）· 16:9 · ポート開放不要 |
| 社内設定 UI | `/app` 豊島邸ダッシュボード「Guard Viewer / EZCloud ライブ共有」 |
| API | `GET/PUT /api/home/v1/toyoshima/cloud-stream` |

### 2.7 盤内温度（RP2350 チップ実測）

主装置・子機とも ADC 内蔵温度センサーを 5 分 HB に同梱する。
既存の DI/DO・点灯秒数は変更しない。

| 項目 | 値 |
|------|------|
| センサー | RP2350 内蔵（`ADC.CORE_TEMP`、ADC4 フォールバック） |
| 換算 | `27 - (reading - 0.706) / 0.001721`（℃・小数1桁） |
| HB キー | `board_temp` / `boardTemp` |
| 表示 | `/customer`・`/app` の盤内温度（主装置） |
| 注意 / 警告 | 45℃ / 60℃（既存しきい値を維持） |

---

## 3. 板橋自宅（TOMS001 / HOME-JP-ITABASHI-LIVE）

### 3.1 識別子・通信

| 項目 | 値 |
|------|-----|
| 主装置 deviceId | `rp2350-itabashi-main-01` |
| 子機 | なし（`rp2350DetachedId=null`） |
| HOME / SITE | `HOME-JP-ITABASHI-LIVE` |
| Security | `SEC-JP-ITABASHI-LIVE` |
| ボード | Waveshare RP2350-POE-ETH-8DI-8RO |
| H.View NVR | `192.168.1.80` · RTSP `rtsp://192.168.1.80:554` |

### 3.2 RP2350 I/O

| 端子 | 役割 | 備考 |
|------|------|------|
| DI1 | 駐車場センサー（外周） | `DI_OUTER=1` |
| DI2 | ガレージセンサー | `DI_INNER=2` |
| DO/CH2 | 外側 100V / 24V 系ライト | `CH_24V=2` |
| DO/CH3 | 100V 投光器 | `CH_100V=3` · DI 時 DO2+DO3 連動 |
| DO/CH1 | **電気錠ワンショット解錠** | `/api/devices/rp2350/relay/1/pulse` · `UNLOCK_MS=1000` |
| CH1 備考 | 風呂ワンショットも channel 1 定義あり | `pulseDurationMs: 500` — 配線排他は現場確認 |

### 3.3 スマートドアホン連携

| 項目 | 値 |
|------|-----|
| 型番 | アイリスオーヤマ **TD-SM5030CT-BSH** |
| 連携 | HomeLink（`homelink://answer`） |
| 解錠連動 | 呼出 → HomeLink 通話 / CH1 解錠パルス（`home_intercom_unlock`） |
| HOME 設定 | `intercom.unlockLinkEnabled: true` |

### 3.4 H.View NVR（CH）

| CH | id | ラベル |
|----|-----|--------|
| CH1 | `cam-entrance` | 玄関カメラ |
| CH2 | `cam-katte` | 勝手口カメラ |
| CH3 | `cam-park` | 駐車場カメラ |
| CH4 | （未割当） | 追加時は本表へ追記 |

### 3.5 稼働パラメータ（既定）

| 項目 | 値 |
|------|-----|
| ライト点灯時間帯 | **18:00〜06:00（JST・日またぎ）** — `isWithinTimeRange` |
| guardMode（rules 既定） | `always` |
| 点灯維持秒数 | **45 秒** |
| perimeterTimeoutSec | 120 |
| デバウンス（VPS rules） | 100 ms |
| デバウンス（板橋ファーム） | **50 ms**（`DI_DEBOUNCE_MS` / `_DEFAULT_DI_CONFIRM_MS`） |
| 解錠パルス | 1000 ms（CH1） |

### 3.7 通信ステータス・盤内温度（追記）

既存の DI/DO・NVR・ドアホン設定は変更しない。
社内 `/app` と顧客 `/customer` の通信カードだけを豊島邸と同型にする。

| 項目 | 値 |
|------|-----|
| 社内カード | 🛰️ 通信ステータス（単一カード） |
| 顧客カード | 🛡 システム安心ステータス |
| Heartbeat API | `POST /api/remote-test/heartbeat` および `/api/home/v1/itabashi/heartbeat` |
| ステータス SSOT | `GET /api/home/v1/itabashi/status`（`itabashi-commHealth`） |
| 盤内温度 | RP2350 チップ内蔵（CORE_TEMP / ADC4）を `boardTemp` で送信 |
| 未取得表示 | `―（取得中）` |
| 適温表示例 | `36.2℃（適温・正常）` |
| しきい値 | 45℃ 注意 / 60℃ 警告 |
| 疑似ハートビート | 社内カードの 💗 ボタン（36.2℃） |

---

## 3.6 テスター専用テナント（TESTER001）

板橋自宅の **実機ミラー**。既存の TOMS001 / TOYOSHIMA001 行は削除しない。

| 項目 | 値 |
|------|-----|
| customerCode | `TESTER001` |
| 表示名 | テスターデモ（板橋） |
| ログイン | `tester.user` / 任意（最上流ハードコード。固定トークン `tester-token-2026`。顧客コードは大文字小文字を問わない） |
| 入口 | `https://tisly.jp/customer`（社内 `/app` の見積・3D・事業カードは非表示） |
| HOME / Security | `HOME-JP-ITABASHI-LIVE` / `SEC-JP-ITABASHI-LIVE`（画面構成は板橋と同じ） |
| RP2350 | **物理 DO 遮断**（リレー／パトライト／湯はりパルスは 200 OK モック。実機 `rp2350-itabashi-main-01` へは送らない） |
| 表示モジュール | Security · HOME · カメラ · 基本ダッシュボード |
| 非表示 | 見積もり · 事業内容 · 3Dプリンター関連 |
| 通知 | デモ画面の状態更新のみ（実機発報の Push は配信しない経路を維持） |

---

## 4. 共通運用ルール

1. **顧客名トリガー:** 修正指示に現場名がある場合は本カルテを開く。
2. **既存データ保護:** 顧客プロファイル・物件配列は削除せず append / merge のみ。
3. **写真分離:** 現調 `survey_photos` と完了報告 `completion_photos` を混在させない。
4. **デプロイ:** `master` push → VPS Auto Deploy。確認は https://tisly.jp/api/health の `commitShort`。
5. **台帳更新:** 端子・NVR・パラメータ変更後は本ファイルへ **追記**（既存行の削除禁止）。
6. **SaaS 見据え:** 顧客ごとデバイス・プラン状態はテナント分離を維持する。
7. **死活監視標準:** 実機 HB **300 秒** · VPS 途絶判定 **5 分 30 秒** ·
   Push は `⚠️ 【緊急】〇〇邸：主装置との通信が途絶えました（5分以上ハートビート未受信）`。

---

## 4.1 現場プロファイル複製（クローン設定）— AI 自走ルール

### 指示書式例

```
新規顧客［佐藤邸］を［豊島邸］と同じ機器構成で作成して。
ただしライト点灯時間は45秒、DI1は玄関センサーに変更して
```

別名: `板橋自宅` を複製元にしてもよい。

### Cursor 自走処理（必須）

1. 複製元（豊島邸=`TOYOSHIMA001` / 板橋自宅=`TOMS001`）の
   機器構成・Modbus・通知・配線を完全コピー。
2. 新規 `customerCode`（例: `SATO001`）と初期ログイン案を発行。
3. ユーザー指定の差分のみピンポイント上書き
   （点灯秒数・センサー名・端子ラベル等）。
4. `docs/CUSTOMER_DEVICES.md` と
   `customer-tenant-profile-v1.ts`（ランタイム追記）へ **非破壊 append**。
5. `/customer` ログイン時に差分設定で動的描画されるよう配線。

実装エントリ:
`server/src/shared/customer/customer-site-profile-clone-v1.ts`
（`buildCustomerSiteProfileCloneV1` / `applyCustomerSiteProfileCloneV1`）

---

## 6. 全現場 RP2350 OTA（追記）

USB なしで PoE LAN 経由の MicroPython 遠隔更新を標準化する。
既存の端子・HB 周期・顧客データは変更しない。

| 項目 | 値 |
|------|------|
| 配信 API | `GET/POST /api/firmware/{siteId}/version\|script\|deploy` |
| siteId | `toyoshima` / `itabashi` / `all`（HOME/SEC ID も可） |
| 実機エンジン | `rp2350/firmware/lib/tisly_ota.py` |
| ロールバック | `main_backup.py` + `boot.py` 起動判定 |
| 社内 UI | `/app/security` Pro カード · 豊島ダッシュボード（顧客 `/customer` 非表示） |
| config.py | 物件固有のため OTA 上書きしない |

---


| 日付 | 内容 |
|------|------|
| 2026-09-22 | 豊島邸 手動 DO1/DO2/DO3 完全連動。GPIO HIGH 強制 · channels 推論 · ファーム 1.2.3。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-21 | 豊島邸 手動点灯を GPIO 明示キックに強化。ライト1=CH1 / ライト2=CH2 / 一括ON=CH1+CH2+CH3。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-21 | TESTER001 ログインを関数先頭ハードコード＋VPS の systemd/pm2 強制再起動に強化。入口は https://tisly.jp/customer のまま。既存顧客データは非破壊 |
| 2026-09-21 | 板橋 Security の物件セレクタ空値とオフライン誤判定を修復。初期選択を SEC-JP-ITABASHI-LIVE / HOME-JP-ITABASHI-LIVE に固定し、5分以内HBでオンライン描画。DI/DO配列は変更なし |
| 2026-09-21 | Security画面から3D間取りUIを撤去。板橋のライト遠隔（DO2/DO3）と遠隔ルールをステータス直下へ再配置。RP2350端子・設定配列は変更なし |
| 2026-09-20 | 板橋 DI擬似発報（test-di-trigger）を実センサーと同じ JST 18:00〜06:00 評価に通し、夜間は DO2/GPIO18·DO3/GPIO19 を維持秒数だけ即時点灯。物理DIも VPS JST 同期で即時ON |
| 2026-09-20 | 板橋防犯ライト手動命令の時間帯バイパス · DO2/GPIO18·DO3/GPIO19 駆動 · センサー連動 JST を VPS UTC+9 算術へ修正 |
| 2026-09-15 | TESTER001 を最上流ハードコード認証（DB 前に 200・token `tester-token-2026`・SW v2541） |
| 2026-09-15 | TESTER001 ログインを API パススルー＋無条件フォールバック化し、PWA キャッシュを v2540 で破棄 |
| 2026-09-15 | TESTER001 ログイン自己修復（Customer not found 解消・表示名「テスターデモ（板橋）」） |
| 2026-09-15 | TESTER001 を実機遮断デモ化（物理 DO 非送信・画面はインタラクティブ） |
| 2026-09-12 | 豊島邸 RP2350 チップ温度（CORE_TEMP）実測を HB / PWA へ連携 |
| 2026-09-11 | 全現場 RP2350 PoE LAN OTA（A/B ロールバック）を標準化 |
| 2026-09-10 | テスター専用 `TESTER001` を追記（板橋実機ミラー・メニュー制限） |
| 2026-09-07 | 初版作成（豊島邸 / 板橋自宅の現場カルテ） |
| 2026-09-07 | HB 途絶を 5分30秒に標準化 · クローン自走ルール追記 |
| 2026-09-07 | 豊島邸 `cloudStreamUrl` / Guard Viewer·EZCloud 埋め込み（方法A）追記 |

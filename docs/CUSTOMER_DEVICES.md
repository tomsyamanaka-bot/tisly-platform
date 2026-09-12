# TiSLY 顧客・機器マスター台帳（現場カルテ）

**最終更新:** 2026-09-12  
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
| テスター専用 | `TESTER001`（板橋実機ミラー） | `HOME-JP-ITABASHI-LIVE` | `SEC-JP-ITABASHI-LIVE` | お客様 `/customer` 限定スコープ |

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
| デバウンス | **100 ms**（`DI_DEBOUNCE_MS` / `diConfirmMs` / `debounceDi*` / `debounceBeamMs`） |
| 通知 | 24h（ライトのみ時間帯制限） |
| 日中挙動 | 通知＋パトライトのみ（ライト省略） |

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
| ログイン | `tester.user` / `tisly-test-2026` |
| 入口 | `https://tisly.jp/customer`（社内 `/app` の見積・3D・事業カードは非表示） |
| HOME / Security | `HOME-JP-ITABASHI-LIVE` / `SEC-JP-ITABASHI-LIVE` |
| RP2350 | `rp2350-itabashi-main-01`（板橋主装置と同一） |
| 表示モジュール | Security · HOME · カメラ · 基本ダッシュボード |
| 非表示 | 見積もり · 事業内容 · 3Dプリンター関連 |
| 通知 | 板橋 DI/DO 発報の Web Push を実配信（`home-security` 購読） |

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
| 2026-09-12 | 板橋自宅の通信ステータスを豊島邸と同型へ統合（盤内温度・疑似HB） |
| 2026-09-12 | 豊島邸 RP2350 チップ温度（CORE_TEMP）実測を HB / PWA へ連携 |
| 2026-09-11 | 全現場 RP2350 PoE LAN OTA（A/B ロールバック）を標準化 |
| 2026-09-10 | テスター専用 `TESTER001` を追記（板橋実機ミラー・メニュー制限） |
| 2026-09-07 | 初版作成（豊島邸 / 板橋自宅の現場カルテ） |
| 2026-09-07 | HB 途絶を 5分30秒に標準化 · クローン自走ルール追記 |
| 2026-09-07 | 豊島邸 `cloudStreamUrl` / Guard Viewer·EZCloud 埋め込み（方法A）追記 |

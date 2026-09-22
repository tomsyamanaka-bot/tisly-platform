# TiSLY 顧客・機器マスター台帳（現場カルテ）

**最終更新:** 2026-09-22  
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
| ロジック版 | `FIRMWARE_LOGIC_VERSION=1.2.4` |
| GPIO 極性 | HIGH=コイルON をファーム強制。`RO_ACTIVE_LOW` は無視 |
| ライト1 | `do1_on` → CH1/GPIO17 HIGH |
| ライト2 | `do2_on` → CH2/GPIO18 HIGH |
| 一括ON | `bulk_on` → CH1+CH2+CH3 / GPIO17+18+19 HIGH |
| 命令補完 | channels 欠落時もコマンド名から CH を推論 |
| PWA | `/customer` `/app` の外構ライト手動操作に一括ON/OFFを含む。session header 付き POST |
| OTA | クラウド最新 1.2.4 をステージング |

### 2.2.7 リレー GPIO 確定表とピン自己修復（2026-09-22 追記）

既存 2.2 / 2.2.1〜2.2.6 は残す。上書きしない。

| 項目 | 値 |
|------|-----|
| ロジック版 | `FIRMWARE_LOGIC_VERSION=1.2.6` · `OTA_VERSION=1.2.6` |
| 公式配列 | Waveshare RP2350-POE-ETH-8DI-8RO **RO1〜RO8 = GPIO17〜24** / **DI1〜DI8 = GPIO9〜16** |
| CH1 | GPIO17（DO1 防犯ライト1） |
| CH2 | GPIO18（DO2 防犯ライト2） |
| CH3 | GPIO19（DO3 フラッシュ） |
| ピンの正 | `main.py` の `BOARD_CH_GPIO`。`config.py` は OTA skipFiles のため実機側が古くても無視して補正する |
| 自己修復 | `set_ch_output` は CH の Pin 未生成時に公式 GPIO で遅延生成する（CH1/CH2 無反応の再発防止） |
| 起動ログ | `relay pinmap CH1=GPIO17 CH2=GPIO18 CH3=GPIO19` |
| DI1 検知 | CH1 HIGH（`lightingDurationSec`） |
| DI2 検知 | CH1+CH2 HIGH ＋ CH3 を `flash_duration_sec`（既定 15 秒） |
| 昼夜バイパス | `force_relay_test` 既定 True。昼間でも DO1/DO2 を駆動 |
| OTA | ライブ版が新しければ本番も `pending=true`。script 取得時もライブと突合して配る |

### 2.2.8 起動フェイルセーフ（セーフモード・2026-09-22 追記）

既存 2.2 / 2.2.1〜2.2.7 は残す。上書きしない。

| 項目 | 値 |
|------|-----|
| ロジック版 | `FIRMWARE_LOGIC_VERSION=1.2.8` · `OTA_VERSION=1.2.8`（2.2.9 で 1.2.7 から更新） |
| 症状 | 起動直後クラッシュ → RGB 赤固定（通信途絶）で遠隔復旧不能 |
| 対策1 | `config.py` 読込失敗 → `_FallbackConfig` で LAN/OTA だけ継続 |
| 対策2 | `toyoshima_security` 読込失敗 → セーフモード（HB と OTA のみ） |
| 対策3 | DI/DO は CH 単位 try/except。1 本の GPIO 失敗で全停止しない |
| 対策4 | `print` は `_safe_print`。端末エンコード例外で起動を落とさない |
| 対策5 | `tisly_ota` / `tisly_self_test` の import を `except Exception` へ拡大 |
| 対策6 | メインループの DI・命令・rules 処理を個別 try/except |
| セーフモード | 30 秒周期で LAN 復旧 → HB（`safe_mode:true` + 理由）→ `maybe_update` |
| RGB | セーフモードは **橙点滅**（赤固定と区別） |
| WDT | セーフモード中も 1 秒ごとに feed |
| 検証 | `rp2350/test/test_toyoshima_firmware_boot.py`（machine スタブで import 検証） |

### 2.2.10 センサー検知 → Push 通知（2026-09-22 追記）

既存 2.2 / 2.2.1〜2.2.9 は残す。上書きしない。

| 項目 | 値 |
|------|-----|
| 実機 → VPS | `POST /api/home/v1/toyoshima/event`（`building` / `di` / `message` / `siteId` / `deviceId`） |
| 実機の送信条件 | `_is_armed_now()`（一時停止・guard off 以外）または `force_relay_test`。SILENT でも通知は送る |
| Push 発火 | `dispatchToyoshimaSensorNotifyV1()` が DO 制御と独立に起動（await しない） |
| 本文 | `<センサー名>が反応しました（豊島邸）`。名称は `TOYOSHIMA_SENSOR_LABELS_V1` |
| センサー名 | DI1 母屋=外周ビーム（母屋・遠）· DI2 母屋=建物至近ビーム（母屋・近）· DI1 はなれ=道路側センサー（はなれ）· DI2 はなれ=通路側センサー（はなれ） |
| 発報履歴 | `home_system_logs_v1` の `sensor_alert`（Push 可否によらず記録・`sensorId` / `skipReason` 付き） |
| 送信結果 | 同テーブルの `push_notify`（`Push送信` / `Push送信失敗` / `Push見送り`） |
| 見送り条件 | 警戒解除中（`guardMode=off` / 一時停止）· 顧客モード `disarmed` · 通知設定 `off` |

### 2.2.11 センサー検知 Push の最終開通（2026-09-22 追記）

既存 2.2 / 2.2.1〜2.2.10 は残す。上書きしない。

| 項目 | 値 |
|------|------|
| 原因 | おでかけ警戒でも `notifyMainFarMode=off` 等が残ると見送り。Promise もレスポンス前に確定する |
| 対策 | `resolveToyoshimaNotifyGateV1()`。`away` は全センサー `critical`。`await` + inflight 保持 |
| ログ | `[toyoshima] event recv / notify gate / push try / push result / POST /event done` |
| 見送り | `disarmed` と一時停止のみ。おでかけ中の個別 off では見送らない |

### 2.2.12 センサー検知 Push の完全独立（2026-09-22 追記）

既存 2.2 / 2.2.1〜2.2.11 は残す。上書きしない。

| 項目 | 値 |
|------|------|
| Push | DO 点灯と完全独立。`processToyoshimaSecurityEventV1` 先頭で起動 |
| 24h | 警戒解除（DISARMED）と一時停止以外は無条件 `critical` |
| 履歴 | `sensor_alert` に `detectedAt` / `detectedAtJst` / `sensorName` |
| バックアップ | heartbeat `inputStates` の DI 立上りも同じ経路（20秒重複抑制） |

### 2.2.21 盤内温度 2段階アラートと TOMS 限定通知（OTA 1.2.13 / 2026-09-23 追記）

既存 2.2 / 2.2.1〜2.2.20 は残す。上書きしない。

| 項目 | 値 |
|------|------|
| ファン | 45.0℃ ON / 40.0℃ OFF。空きリレー **RO8（CH8 / GPIO24）**。照明 DO1〜DO3・解錠 CH1 は使わない |
| HB | 300 秒。`board_temp` / `boardTemp` / `fan_on` |
| 50℃ | TOMS `/app` のみ「先回り点検」Push。施主は通知なし・軽微な注意 |
| 60℃ | TOMS と施主の両方へ緊急 Push |
| OTA | `FIRMWARE_LOGIC_VERSION=1.2.13` · `OTA_VERSION=1.2.13` |
| SW | `tisly-pwa-v2563-board-temp-toms` |

### 2.2.20 アラーム発報カードからカメラ画像削除（2026-09-22 追記）

既存 2.2 / 2.2.1〜2.2.19 は残す。上書きしない。

| 項目 | 値 |
|------|------|
| 対象 | `/app` · `/customer` の発報カードと履歴 |
| 表示 | 発生日時・検知センサー名・対応完了のみ。スナップ非表示 |
| SW | `tisly-pwa-v2562-alarm-no-snap` |

### 2.2.19 即時 /event ソケット送信とスライダー色分け（OTA 1.2.12 / 2026-09-22 追記）

既存 2.2 / 2.2.1〜2.2.18 は残す。上書きしない。

| 項目 | 値 |
|------|------|
| 実機 | `/event` は生ソケット・2.5秒タイムアウト。WDT 8秒前に必ず戻る |
| 例外 | JSON / OSError / MemoryError を握り ASCII 再送 |
| サーバ | 検証済み `/event` は処理失敗でも 200 `accepted` |
| UI | 秒スライダー＝暖色、ms感度＝寒色（⚡/🐢） |
| OTA | `FIRMWARE_LOGIC_VERSION=1.2.12` · `OTA_VERSION=1.2.12` |
| SW | `tisly-pwa-v2561-event-slider-split` |

### 2.2.18 社内物件切替・通知条件・顧客カメラCTA（2026-09-22 追記）

既存 2.2 / 2.2.1〜2.2.17 は残す。上書きしない。

| 項目 | 値 |
|------|------|
| 社内 | `/app` セレクタで板橋 / 豊島の感応度・通知条件が切り替わる |
| 保存 | スライダー / タップは対象テナントの rules へ即時保存し実機同期 |
| 顧客 | 映像・スナップ非表示。`カメラを見る`（Guard Viewer）のみ |
| SW | `tisly-pwa-v2560-toms-site-notify-camera` |

### 2.2.17 Web Push 強制発火（2026-09-22 追記）

既存 2.2 / 2.2.1〜2.2.16 は残す。上書きしない。

| 項目 | 値 |
|------|------|
| 対象 | `TOYOSHIMA001` · `/event` · `dispatchToyoshimaSensorNotifyV1` |
| 条件 | `sensor_alert` を書いた検知は Push を無条件で 1 回呼ぶ |
| 失敗 | コンソールへ `Push Send Error: …`（VAPID / Subscription invalid 等） |
| 購読 | `notification_tokens` と `pwa_subscriptions` を合算 |
| 既存保護 | 2.2 系・はなれ・板橋は非破壊 |

### 2.2.16 即時 /event の確実発火（OTA 1.2.11 / 2026-09-22 追記）

既存 2.2 / 2.2.1〜2.2.15 は残す。上書きしない。

| 項目 | 値 |
|------|------|
| ロジック版 | `FIRMWARE_LOGIC_VERSION=1.2.11` · `OTA_VERSION=1.2.11` |
| 実機 | GPIO 後に同期 1 回 POST。`create_task` は失敗時再送のみ。例外は握る |
| 文字化け | dumps / 絵文字失敗時は `DI{n} detect` で再送 |
| サーバ | `/event` は 2 秒バーストのみ抑制。初回検知は Push を止めない |
| HB | 同一 ON の再送は従来どおり 45 秒＋ sticky ON |

### 2.2.15 センサー通知の重複ループ防止（OTA 1.2.10 / 2026-09-22 追記）

既存 2.2 / 2.2.1〜2.2.14 は残す。上書きしない。

| 項目 | 値 |
|------|------|
| ロジック版 | `FIRMWARE_LOGIC_VERSION=1.2.10` · `OTA_VERSION=1.2.10` |
| 実機 | `/event` 成功後 `_event_acked`。物理 OFF まで再送しない |
| サーバ | DI 状態は物理 OFF まで保持。同一センサー短時間重複は Push スキップ |
| HB | 同一 ON の再送は立上りにならない |

### 2.2.14 センサー検知の即時 /event 送信（OTA 1.2.9 / 2026-09-22 追記）

既存 2.2 / 2.2.1〜2.2.13 は残す。上書きしない。

| 項目 | 値 |
|------|------|
| ロジック版 | `FIRMWARE_LOGIC_VERSION=1.2.9` · `OTA_VERSION=1.2.9` |
| 即時送信 | DI 立上りで GPIO 後すぐ `POST /api/home/v1/toyoshima/event` |
| 独立 | heartbeat 5 分周期とは別キュー。失敗は 200ms 再送 |
| サーバ | source=`event` はクールダウン無視。heartbeat バックアップのみ重複抑制 |

### 2.2.13 通知ストッパー解除・昼夜ライト分離・警戒ON/OFF（2026-09-22 追記）

既存 2.2 / 2.2.1〜2.2.12 は残す。上書きしない。

| 項目 | 値 |
|------|------|
| ストッパー | `TOYOSHIMA_NOTIFY_COOLDOWN_MS_V1=45000`。発報後 45 秒で DI 状態を `off` に戻す |
| 再通知 | クールダウン後の立上りは何度でも Push。`/event` は毎回送信 |
| 夜間ライト | スケジュール窓内は `forceRelayTest` を見ない。日中だけ昼間テスト |
| 警戒 UI | ON=`away`（全センサー連動） / OFF=`disarmed`（通知ミュート） |
| 見るエリア | 顧客画面は非表示。関数とマークアップは再表示用に残す |

### 2.2.9 USB 直接書き込み（蘇生手順・2026-09-22 追記）

既存 2.2 / 2.2.1〜2.2.8 は残す。上書きしない。

| 項目 | 値 |
|------|-----|
| ロジック版 | `FIRMWARE_LOGIC_VERSION=1.2.8` · `OTA_VERSION=1.2.8` |
| 症状 | 実機が旧版（`main.py` 18,844B / `fw=1.1.0`）のまま。`lib/tisly_ota.py`・`lib/tisly_rgb.py` が未配置で **OTA が届かない** |
| 転送ツール | `mpremote`（`python -m mpremote`）· ポートは `COM6`（VID 2E8A / Waveshare RP2350-eth-8di-8ro） |
| バックアップ | 書き込み前に実機全ファイルを `rp2350/backup/toyoshima-YYYYMMDD/` へ退避 |
| 転送対象 | `main_toyoshima.py`→`main.py` · `toyoshima_security.py` · `config_toyoshima.py`→`config.py` · `boot.py` · `tisly_self_test.py` · `lib/tisly_ota.py` · `lib/tisly_rgb.py` |
| config 差分 | 現場値（TENANT/SITE/DEVICE/TOKEN/STATIC_IP）は同一。追加は `RO_ACTIVE_LOW` `CH_INVERT` `OTA_*` のみ → USB では上書き可 |
| 残置 | `toshima_security.py`（旧綴り）· `config.json` · `shippable.json` · `*_backup.py` は削除しない |
| 版申告 | `ota_state.json` 未作成時は `config.OTA_VERSION` を申告（`load_ota_state` は空辞書を返す） |
| 起動確認 | `python rp2350/tools/capture_boot_log.py COM6 120` — `relay pinmap` → `lan ok` → `heartbeat sent ONLINE` |
| 実測（2026-09-22） | IP `192.168.1.85` · `board_temp=40.5C` · WDT 8000ms · セーフモード入らず |

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
| しきい値 | 45℃ 注意 / 50℃ TOMS先回り / 60℃ 警告 |
| ファン | 空き RO8。45℃ ON / 40℃ OFF |
| 疑似ハートビート | 社内カードの 💗 ボタン（36.2℃） |

### 3.8 盤内温度 2段階アラート（2026-09-23 追記）

既存 3.1〜3.7 は残す。上書きしない。

| 項目 | 値 |
|------|------|
| 50℃ | TOMS `/app` のみ先回り Push。施主は通知なし |
| 60℃ | TOMS と施主の両方へ緊急 Push |
| ファン | 解錠 CH1 は使わず RO8 |

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
| 2026-09-23 | 盤内温度 45/40℃ファン、50℃ TOMS限定、60℃双方緊急。OTA 1.2.13。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | 社内物件切替で感応度と通知条件を連動。顧客画面はカメラCTAのみ。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | 豊島邸 アラーム記録後は Web Push を無条件発火。失敗は `Push Send Error:` を残す。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | 発報カード・履歴からカメラ画像を削除。日時とセンサー名のみ表示。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | 豊島邸 /event をタイムアウト付き生ソケット化。秒/msスライダー色分け。OTA 1.2.12。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | 豊島邸 即時 /event のサイレントエラーを修正。同期1回POST＋2秒バースト。OTA 1.2.11。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | 豊島邸 センサー通知の HB 再送ループを停止。成功後フラグクリア、物理OFFまで再送しない。OTA 1.2.10。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | 豊島邸 センサー検知を /event 即時POSTに分離。HB 5分待ちを解消。OTA 1.2.9。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | 豊島邸 通知ストッパーを45秒で解除。夜間ライトは昼間テストと分離。警戒をON/OFFの2択に簡素化。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | 豊島邸 センサー検知 Push を DO から完全独立。警戒解除以外は24h送信し、履歴に日時とセンサー名を残す。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | 豊島邸 センサー検知 Push を最終開通。おでかけ警戒は個別 off でも緊急送信。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | 豊島邸 Security の一括ON/OFF重複を解消し、防犯カメラカードを非表示。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | Security 設定 UI を視覚化。1F/外周 SVG、昼夜カード、点灯秒数スライダー。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | 豊島邸 センサー検知 Push を DO 制御から分離。センサー名入り本文・`sensor_alert` / `push_notify` 履歴を必ず記録。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | 豊島邸 実機を USB（mpremote · COM6）で直接書き込み蘇生。`lib/tisly_ota.py`・`lib/tisly_rgb.py` 欠落を解消し OTA 経路を開通。ファーム 1.2.8。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | 豊島邸 起動クラッシュ対策。config/ロジック/GPIO/print を個別保護し、失敗時は橙点滅のセーフモードで OTA 待機。ファーム 1.2.7。既存 2.2 系・はなれ・板橋は非破壊 |
| 2026-09-22 | 豊島邸 リレー GPIO を公式配列（RO1〜RO8=GPIO17〜24）で固定し、config.py 依存の CH1/CH2 未生成を自己修復。ファーム 1.2.6。既存 2.2 系・はなれ・板橋は非破壊 |
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

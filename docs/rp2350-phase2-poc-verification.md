# Phase 2 — RP2350 最終確認手順（PoC 完了判定）

**対象:** 智紀さん（初心者向け）  
**フェーズ:** Phase 2 最終確認（commit `102e920` push 済み · VPS heartbeat 404 修正済み）  
**目的:** **ファームウェア再変更なし**で Thonny RESET のみ行い、合格条件 5 項目をすべて満たしたら **Phase 2 RP2350 PoC 完了** と記録する。

| 項目 | 値 |
|------|-----|
| RP2350 IP | `192.168.1.227`（DHCP・環境により変わる場合あり） |
| ファームウェア版 | `1.1.0-poc-success` |
| poll 間隔 | 3 秒 |
| heartbeat 間隔 | 60 秒 |
| PWA URL | https://tisly.jp/remote-test |
| VPS 事前確認 | トークンなし curl → **403**（404 でない = ルート存在）· トークンあり → **200 OK** |

> **重要:** RP2350 へのファイル再アップロードは **不要** です。Thonny で接続して **RESET ボタンを 1 回** 押すだけで確認を始められます。

---

## 最終確認クイック手順（智紀さん向け・この順で実施）

所要時間の目安: **約 3〜5 分**（heartbeat 60 秒待ちを含むと **約 2 分追加**）

| 順 | 作業 | 合格の見方 |
|----|------|------------|
| **1** | Thonny で RP2350 に接続 → **RESET 1 回**（§1 参照） | Shell に `TISLY BOOT` · `polling start (poll 3 sec / heartbeat 60 sec)` |
| **2** | Shell を **90 秒** 見守る | `heartbeat sent` が **起動直後 1 回** + **約 60 秒後に 1 回**（3 秒ごとではない）· **`error: heartbeat HTTP 404` が一切出ない** |
| **3** | ブラウザで https://tisly.jp/remote-test を開く（トークン保存済み） | 状態 **online** · **最終接続** が RESET 後の時刻 · **ファームウェア** = `1.1.0-poc-success` |
| **4** | PWA で **CH1 ON** → リレーを目視 | **3 秒以内**に Shell に `command received: ch1_on` · `EXEC CH1 ON` · リレーがカチッと ON |
| **5** | PWA で **CH1 OFF** → リレーを目視 | **3 秒以内**に `command received: ch1_off` · `EXEC CH1 OFF` · リレーがカチッと OFF |
| **6** | 上記 1〜5 がすべて OK | 本ドキュメント **§6 完了記録** にチェックを入れて記入 |

**合格条件（すべて必須）**

- Thonny Shell に `heartbeat HTTP 404` が **出ない**
- `heartbeat sent` が **約 60 秒に 1 回**（起動直後の 1 回を除く）
- PWA で `firmwareVersion` = **1.1.0-poc-success**
- CH1 ON/OFF が PWA から **3 秒以内**に反応
- リレーが ON/OFF で **カチッと** 動く

---

## 0. 事前確認（VPS — 済みならスキップ可）

VPS で以下が **200 OK** なら、RP2350 側の問題に絞って切り分けできます。

```bash
TOKEN="あなたのREMOTE_TEST_TOKEN"
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-Remote-Test-Token: $TOKEN" \
  "https://tisly.jp/api/remote-test/heartbeat?firmware=1.1.0-poc-success"
```

期待: `200`

---

## 1. Thonny で RP2350 を RESET する（初心者向け）

### 1-1. 準備

- RP2350 に **PoE または LAN ケーブル** が刺さっていること
- PC に [Thonny](https://thonny.org/) が入っていること
- RP2350 を USB で PC に接続（Shell ログを見るため）

### 1-2. Thonny で接続

1. Thonny を起動する
2. メニュー **実行 → インタプリタ** を開く
3. **MicroPython (Raspberry Pi Pico)** を選ぶ
4. **ポート** で `Raspberry Pi Pico` / `COMx` を選び **OK**
5. 画面下の **Shell** に `>>>` が出れば接続成功

### 1-3. RESET（今回の主作業）

1. Shell が見える状態のまま、RP2350 ボード上の **RESET** ボタンを **1 回** 押す  
   （小さな黒ボタン。BOOT ボタンではありません）
2. Shell にログが流れ始めるのを待つ（数秒）
3. **ファイルのアップロードや Run ボタンは押さない**（`main.py` は起動時に自動実行されます）

### 1-4. 接続できないとき

| 症状 | 対処 |
|------|------|
| Shell に `>>>` が出ない | USB ケーブル差し直し · 別 COM ポートを試す |
| RESET してもログが出ない | インタプリタが Pico になっているか確認 · RESET をもう一度 |
| `TISLY BOOT` が出ない | ボード直下に `boot.py` / `main.py` があるか右ペインで確認 |

---

## 2. 正常ログの見本

RESET 直後、Shell に **次のような流れ** が出れば正常です。

```
========================================
           TISLY BOOT
========================================

[tisly] device: rp2350-remote-test-01  fw: 1.1.0-poc-success
[tisly] CH1 GPIO17 → OFF
[tisly] Ethernet init
[tisly] IP address: 192.168.1.227
[tisly]   netmask: 255.255.255.0  gw: 192.168.1.1  dns: 8.8.8.8
[tisly] polling start (poll 3 sec / heartbeat 60 sec)

[tisly] heartbeat sent
```

### 正常判定のポイント

| ログ | 意味 | 合格基準 |
|------|------|----------|
| `TISLY BOOT` | `boot.py` 起動 | RESET 後すぐ出る |
| `IP address: 192.168.1.227` | DHCP 成功 | `0.0.0.0` でない |
| `polling start (poll 3 sec / heartbeat 60 sec)` | 間隔分離版 `main.py` | この表記どおり |
| `heartbeat sent` | VPS へ生存確認成功 | **起動直後に 1 回**、以降 **約 60 秒に 1 回** |
| `error: heartbeat HTTP 404` | VPS にルートなし | **出てはいけない**（修正後の確認ポイント） |

CH1 操作時の正常ログ例:

```
[tisly] command received: ch1_on
[tisly] EXEC CH1 ON

[tisly] command received: ch1_off
[tisly] EXEC CH1 OFF
```

### NG パターン（要対処）

| ログ | 意味 |
|------|------|
| `[tisly] error: heartbeat HTTP 404 — ...` | VPS またはトークン・URL の問題（§3 参照） |
| `[tisly] error: AUTH 403 — ...` | `config.py` のトークンと VPS `.env` が不一致 |
| `heartbeat sent` が **3 秒ごと** | RP2350 の `main.py` が古い（今回は再アップロード不要の前提だが、出たら要確認） |
| `polling start` の表記が古い | `main.py` 未更新の可能性 |

---

## 3. heartbeat HTTP 404 がまだ出る場合の切り分け

**順番に確認**してください。上から合格したら次へ進みます。

### Step A — VPS 側（RP2350 より先に確認）

```bash
cd /opt/tisly
git log -1 --oneline          # 102e920 以降か（heartbeat 404 修正は d133aaa）
cd server && npm run build
sudo systemctl restart tisly-server

TOKEN="あなたのREMOTE_TEST_TOKEN"
curl -s -H "X-Remote-Test-Token: $TOKEN" \
  "https://tisly.jp/api/remote-test/heartbeat?firmware=1.1.0-poc-success"
```

| curl 結果 | 判断 |
|-----------|------|
| `{"ok":true,...}` / HTTP 200 | VPS は正常 → **Step B へ** |
| HTTP 404 | VPS に heartbeat ルート未反映 → `git pull` · `npm run build` · `restart` を再実行 |
| HTTP 403 | トークン不一致 → VPS `.env` の `REMOTE_TEST_TOKEN` と curl の `TOKEN` を照合 |
| HTTP 503 | `.env` 未設定 → `REMOTE_TEST_TOKEN` を `.env` に追加して restart |

`scripts/deploy.sh` 実行時は heartbeat が 404 ならエラーで止まるようになっています（`d133aaa`）。

### Step B — RP2350 の接続・設定

1. Shell で `IP address:` が実 IP（例: `192.168.1.227`）か確認
2. Thonny 右ペインで `config.py` を開き、次を確認:
   - `API_BASE = "https://tisly.jp"`（末尾スラッシュなし）
   - `REMOTE_TEST_TOKEN` が VPS `.env` と **完全一致**
   - `FIRMWARE_VERSION = "1.1.0-poc-success"`
3. RESET して `heartbeat sent` が出るか再確認

### Step C — ネットワーク

| 確認 | 方法 |
|------|------|
| LAN リンク | ケーブル・PoE 給電 · ハブのリンク LED |
| DNS / HTTPS | Waveshare 同梱 MicroPython（ssl 同梱 UF2）を使用しているか |
| 社内 FW | RP2350 から `https://tisly.jp` への HTTPS が通るか（VPS curl 200 でも RP2350 側で遮断される場合あり） |

### Step D — 切り分けまとめ

| Shell のエラー | 最も多い原因 | 対処 |
|----------------|--------------|------|
| `heartbeat HTTP 404` | VPS `dist` 未反映 | Step A |
| `heartbeat HTTP 403` | トークン不一致 | `config.py` と `.env` を揃える |
| `HTTP: ...`（OSError） | LAN 未接続・DNS | ケーブル · IP · `lib/` |
| `urequests 未インストール` | パッケージ不足 | Thonny → ツール → パッケージ → `urequests` |
| `heartbeat sent` 不出力・404 以外 | poll は動くが heartbeat だけ失敗 | Step A の curl と Shell を同時刻で比較 |

---

## 4. PWA 側で確認する項目

ブラウザ（PC または iPhone Safari）で https://tisly.jp/remote-test を開き、以下を確認します。

### 4-1. トークン・接続状態

| # | 画面の項目 | 合格基準 |
|---|------------|----------|
| 1 | トークン入力 → **トークンを保存** | エラーなく保存できる |
| 2 | **RP2350 接続** → 状態 | **online**（緑系表示） |
| 3 | **最終接続** / **RP2350接続時刻** | RESET 後、時刻が **現在時刻付近** に更新される |
| 4 | **ファームウェア** | `1.1.0-poc-success` |
| 5 | **最終ポーリング** | 数秒おきに更新される（poll 3 秒） |

### 4-2. CH1 状態表示

| # | 操作 | 合格基準 |
|---|------|----------|
| 6 | **CH1 ON** を押す | CH1 バッジが **on** に変わる |
| 7 | **CH1 OFF** を押す | CH1 バッジが **off** に変わる |
| 8 | **状態確認** ボタン | 待機コマンド・ポーリング時刻が更新される |

### 4-3. Push（iPhone PWA の場合・任意だが推奨）

| # | 項目 | 合格基準 |
|---|------|----------|
| 9 | ホーム画面 PWA から起動 | 表示モードが standalone 系 |
| 10 | **Push 登録** | 購読状態が登録済み |
| 11 | **Push テスト** | iPhone に通知 · **Push 成功時刻** が更新 |

### 4-4. offline 確認（時間に余裕がある場合）

1. RP2350 の電源または LAN を切る
2. 約 **90 秒** 待つ（`DEVICE_OFFLINE_THRESHOLD_SEC=90`）
3. PWA の状態が **offline** になる
4. 電源・LAN を戻し RESET → 60 秒以内に **online** と接続時刻が再更新

---

## 5. CH1 ON/OFF が 3 秒以内に反応するか

**秒針またはスマホのタイマー** を使い、PWA ボタン押下から Shell / リレー反応までを測ります。

### 手順

1. Thonny Shell を見える状態にする
2. https://tisly.jp/remote-test でトークン保存済みであること
3. **CH1 ON** を押す → **3 秒以内**に Shell に次が出ること:
   ```
   [tisly] command received: ch1_on
   [tisly] EXEC CH1 ON
   ```
4. リレー（GPIO17 / RO1）が物理的に ON になることを目視
5. **CH1 OFF** を押す → **3 秒以内**に:
   ```
   [tisly] command received: ch1_off
   [tisly] EXEC CH1 OFF
   ```
6. リレーが OFF になることを目視
7. 上記を **2 回繰り返し**、毎回 3 秒以内なら合格

### 3 秒を超える場合

| 確認 | 内容 |
|------|------|
| Shell に `poll HTTP` エラー | VPS `/api/remote-test/command` · トークン |
| Shell に何も出ない | RP2350 が online か · PWA で CH1 バッジは変わるか |
| PWA は変わるがリレー無反応 | 配線 · GPIO17 · リレー駆動回路 |
| 常に 3〜6 秒 | poll 間隔 3 秒のため、最悪でも次の poll まで待つ設計（**6 秒超は NG**） |

---

## 6. 完了記録 — Phase 2 RP2350 PoC 完了

**§「最終確認クイック手順」の 1〜5 がすべて ✅ なら Phase 2 PoC 完了** と記録します。

| # | 項目 | 確認者 | 日時 | 結果 |
|---|------|--------|------|------|
| 1 | VPS heartbeat curl 200 OK（トークンあり） | | | ☐ |
| 2 | RESET 後 Shell に `heartbeat sent`（**404 なし**） | | | ☐ |
| 3 | `heartbeat sent` が約 60 秒間隔（3 秒ごとでない） | | | ☐ |
| 4 | PWA **online** · **lastSeen** 更新 · fw `1.1.0-poc-success` | | | ☐ |
| 5 | CH1 ON → 3 秒以内 · リレー ON（カチッと音） | | | ☐ |
| 6 | CH1 OFF → 3 秒以内 · リレー OFF（カチッと音） | | | ☐ |
| 7 | （任意）Push テスト成功 | | | ☐ |
| 8 | （任意）offline 90 秒判定 | | | ☐ |

**完了宣言（全必須項目 OK 後に記入）:**

```
Phase 2 RP2350 PoC 完了
確認日: ____年__月__日
確認者: 智紀
RP2350 IP: 192.168.1.227
ファームウェア: 1.1.0-poc-success
VPS commit: 102e920（heartbeat 404 修正: d133aaa）
備考:
```

> 記入後、担当者が README の Phase 2 セクションを「PoC 完了」に更新する。

---

## 7. 次フェーズ — CH2〜CH8 拡張（実装準備のみ・コード変更なし）

Phase 2 完了後に着手。**コード変更はまだ行いません。** 詳細設計: [`docs/rp2350_phase3_design.md`](rp2350_phase3_design.md)

### 実装前タスク（ハードウェア）

| # | タスク | 担当 | 状態 |
|---|--------|------|------|
| 1 | Waveshare Wiki `01_GPIO` とシルク表示を照合 | | ☐ |
| 2 | `rp2350/config/gpio_map.json` の RO2〜RO8 `gpio_pin` を埋める | | ☐ |
| 3 | 各 RO を 1 点ずつ Thonny で ON/OFF 実測（CH1=GPIO17 は済） | | ☐ |

### 実装タスク（ソフトウェア・Phase 3 着手時）

| 層 | ファイル / エンドポイント | やること |
|----|---------------------------|----------|
| **VPS API** | `server/src/routes/remote-test-*.ts` | `POST /api/remote-test/ch{N}/on\|off`（N=1..8）· `command` を `ch3_on` 等に一般化 · `chStates` で全 CH 保持 |
| **PWA** | `server/public/remote-test/` | CH1 と同 UI パターンで CH2〜8 ボタンを縦リスト追加 |
| **RP2350** | `rp2350/firmware/config.py` · `main.py` | `CH_GPIO` マップ · `exec_command()` 一般化 · `relay_manager.py` 段階統合 |

### 完了条件（次フェーズ）

- PWA から CH1〜CH8 それぞれ **3 秒以内**に反応
- VPS status API に全 CH 状態が含まれる
- 各 CH のリレーが実機でカチッと動作

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| [`docs/remote-test-phase2-deploy.md`](remote-test-phase2-deploy.md) | VPS デプロイ・iPhone 操作 |
| [`rp2350/firmware/README.md`](../rp2350/firmware/README.md) | ファームウェア詳細・トラブルシュート |
| [`docs/rp2350_phase3_design.md`](rp2350_phase3_design.md) | CH2〜CH8 以降の設計 |

# TiSLY Remote Test — RP2350 最小ファームウェア

**目的:** PoE 起動だけで `https://tisly.jp` へ接続し、PWA から CH1 ON/OFF を実行する。

| 項目 | 値 |
|------|-----|
| ボード | Waveshare RP2350-POE-ETH-8DI-8RO |
| MCU | Raspberry Pi Pico 2 (RP2350) |
| MicroPython | v1.28.0（Waveshare 同梱 UF2 推奨） |
| CH1 GPIO | 17（RO1 暫定） |
| ファームウェア版 | **v1.1.0-poc-success** |
| 命令取得（poll） | 3 秒 |
| 生存確認（heartbeat） | 300 秒（5 分） |

### 【実機確認済み】

- Ethernet 接続成功（W5500 / DHCP）
- PWA 制御成功（`https://tisly.jp/remote-test`）
- CH1 ON/OFF 成功（リレー実機動作確認済み）
- heartbeat 成功（接続時刻更新）

---

## 実機反映前 — 最終確認（heartbeat / poll 分離）

**対象変更:** `poll` 3 秒 / `heartbeat` 300 秒を分離（`config.py` · `main.py` · `remote_test_poll.py`）  
**今回の実機アップロード:** `config.py` と `main.py` のみ（`lib/` は変更なし）

### 実機アップロード用チェックリスト

Thonny で **RP2350 直下**（`Raspberry Pi Pico 2/` ルート）へ上書きするファイル:

| # | PC 側（リポジトリ） | RP2350 側 | 必須 |
|---|---------------------|-----------|------|
| 1 | `rp2350/firmware/config.py` | `config.py` | ✅ |
| 2 | `rp2350/firmware/main.py` | `main.py` | ✅ |

**今回アップロード不要:**

| ファイル / フォルダ | 理由 |
|---------------------|------|
| `lib/` | 変更なし |
| `boot.py` | 変更なし |

手順:

- [ ] Thonny で RP2350 に接続（Shell に `>>>` が出る）
- [ ] 左ペイン: `rp2350/firmware/` を開く
- [ ] 右ペイン: RP2350 **直下** を選択（`firmware/` サブフォルダは作らない）
- [ ] `config.py` を右クリック → **アップロード to /**（上書き）
- [ ] `main.py` を右クリック → **アップロード to /**（上書き）
- [ ] `config.py` の `REMOTE_TEST_TOKEN` が VPS `server/.env` と一致していることを確認
- [ ] RP2350 の **RESET** ボタンを押す

### 実機確認手順（Shell ログ）

1. Thonny で `config.py` と `main.py` を RP2350 直下へ上書き
2. RP2350 を **RESET**
3. Shell ログで以下を確認:

**期待ログ（起動直後）:**

```
[tisly] polling start (poll 3 sec / heartbeat 60 sec)
[tisly] heartbeat sent
```

4. 以降、`heartbeat sent` が **約 60 秒に 1 回だけ** 出ること（3 秒ごとに出たら NG）
5. `https://tisly.jp/remote-test` でトークン保存後、**RP2350接続時刻** が更新されること

### CH1 確認

| # | 操作 | 合格基準 |
|---|------|----------|
| 1 | PWA で **CH1 ON** | **3 秒以内**に Shell に `[tisly] EXEC CH1 ON` |
| 2 | PWA で **CH1 OFF** | **3 秒以内**に Shell に `[tisly] EXEC CH1 OFF` |

リレー（GPIO17）の物理動作も目視で確認してください。

### トラブル時の切り分け

| 症状 | 想定原因 | 確認・対処 |
|------|----------|------------|
| `heartbeat sent` が **3 秒ごと**に出る | RP2350 側 `main.py` が古い（heartbeat が poll と同期） | `main.py` を再アップロード → RESET |
| `polling start` の表示が古い（例: 間隔表記なし） | `main.py` 未上書き | Thonny 右ペインの `main.py` を開き、リポジトリ版と差分確認 → 再アップロード |
| CH1 が反応しない | `poll_command` 側・トークン・VPS command API | Shell に `command received` / `EXEC` が出るか · `REMOTE_TEST_TOKEN` 一致 · `curl` で `GET /api/remote-test/command` |
| `heartbeat sent` が出ない | heartbeat API・トークン・LAN・DHCP | `error: heartbeat HTTP` の有無 · トークン · PoE/LAN · `lib/` 配置 · IP 取得ログ |

---

## RP2350 ボードへコピーするファイル

Thonny の「ファイル」左ペイン（PC）から **右ペイン（RP2350 直下）** へ、次の **3 ファイルだけ** をコピーします。

| PC 側（このリポジトリ） | RP2350 側（保存先） |
|-------------------------|---------------------|
| `rp2350/firmware/boot.py` | `boot.py` |
| `rp2350/firmware/main.py` | `main.py` |
| `rp2350/firmware/config.py` | `config.py` |

**RP2350 直下のイメージ:**

```
Raspberry Pi Pico 2/
├── boot.py      ← 起動時 TISLY BOOT
├── main.py      ← ポーリング本体
├── config.py    ← 設定（トークン等）
└── lib/         ← Waveshare 同梱（下記）
```

> **注意:** `firmware/` というサブフォルダは **作らない** でください。  
> `boot.py` / `main.py` / `config.py` は **ボードのルート（最上位）** に置きます。

### あわせて必要なもの（Waveshare 同梱 ZIP）

| 内容 | RP2350 側 |
|------|-----------|
| W5500 用 `lib/` フォルダ | ボード直下 `lib/` |
| MicroPython UF2 | 事前に書き込み済みであること |

Waveshare Wiki の **MicroPython ファームウェア** と **02_MQTT** サンプル内の `lib/` を参照してください。

---

## Thonny で RP2350 へ保存する手順（初心者向け）

### 1. 準備

1. [Thonny](https://thonny.org/) を PC にインストール
2. Waveshare 同梱 MicroPython UF2 を RP2350 に書き込み（BOOT 押しながら USB → UF2 をドラッグ）
3. PoE または LAN ケーブルでネットワークに接続

### 2. Thonny で RP2350 に接続

1. Thonny を起動
2. メニュー **実行 → インタプリタ** を開く
3. **MicroPython (Raspberry Pi Pico)** を選択
4. **ポート** で `Raspberry Pi Pico` / `COMx` を選択 → OK
5. 下部 **Shell** に `>>>` が出れば接続成功

### 3. ファイルをコピー

1. Thonny 左下 **ファイル** ペインを表示（表示 → ファイル）
2. 左（PC）: このリポジトリの `rp2350/firmware/` を開く
3. 右（RP2350）: ボード直下（`Raspberry Pi Pico`）を選択
4. 次を **右クリック → アップロード to /** で送る:
   - `boot.py`
   - `main.py`
   - `config.py`
5. Waveshare 同梱 `lib/` フォルダも右ペイン直下にコピー

### 4. config.py を編集

1. Thonny 右ペインで `config.py` をダブルクリック
2. `REMOTE_TEST_TOKEN` を VPS の `server/.env` と **同じ値** に変更

```python
REMOTE_TEST_TOKEN = "tisly2026test"  # VPS .env と一致させる
```

3. **Ctrl+S** で保存（RP2350 上に上書き保存）

### 5. urequests をインストール（未インストールの場合）

Shell で:

```python
import mip
mip.install("urequests")
```

または Thonny メニュー **ツール → パッケージ** から `urequests` を検索してインストール。

### 6. 起動・確認

1. RP2350 の **RESET** ボタンを押す（または USB 抜き差し）
2. Shell に次のようなログが出れば成功:

```
========================================
           TISLY BOOT
========================================

[tisly] Ethernet init
[tisly] IP address: 192.168.x.x
[tisly] polling start (poll 3 sec / heartbeat 60 sec)

[tisly] heartbeat sent          ← 60 秒ごとに 1 回のみ
[tisly] command received: ch1_on
[tisly] EXEC CH1 ON
```

3. iPhone / PC で `https://tisly.jp/remote-test` を開く
4. 同じトークンを保存 → **RP2350接続時刻** が更新されることを確認
5. **CH1 ON / CH1 OFF** → Shell に `EXEC CH1 ON` / `EXEC CH1 OFF` が出る

---

## 期待ログ一覧

| ログ | 意味 |
|------|------|
| `TISLY BOOT` | 起動（boot.py） |
| `Ethernet init` | W5500 / LAN 初期化開始 |
| `IP address: ...` | DHCP 取得 IP |
| `polling start` | poll 3 秒 / heartbeat 60 秒で開始 |
| `heartbeat sent` | VPS へ生存確認送信（60 秒ごと・接続時刻更新） |
| `command received: ch1_on` | コマンド受信 |
| `EXEC CH1 ON` | GPIO17 HIGH |
| `EXEC CH1 OFF` | GPIO17 LOW |
| `error: ...` | エラー内容 |

---

## トラブルシュート

| 症状 | 確認 |
|------|------|
| `heartbeat sent` が 3 秒ごと | `main.py` が古い → 再アップロードして RESET |
| `polling start` が古い表記 | `main.py` 未上書き → 再アップロード |
| CH1 が反応しない | `poll_command` · トークン · VPS `GET /api/remote-test/command` |
| `heartbeat sent` が出ない | heartbeat API · トークン · LAN · DHCP · `lib/` |
| RP2350接続時刻が更新されない | Shell で `heartbeat sent` が出ているか / トークン一致 / VPS 稼働 |
| `error: AUTH 403` | `config.py` のトークン = VPS `REMOTE_TEST_TOKEN` |
| `error: urequests 未インストール` | 上記 mip 手順 |
| IP が取れない | PoE 給電・LAN ケーブル・`lib/` 配置 |
| HTTPS エラー | Waveshare MicroPython UF2（ssl 同梱版）を使用 |

---

## 関連

- VPS API: `GET /api/remote-test/command`（3 秒・命令取得）/ `GET /api/remote-test/heartbeat`（60 秒・生存確認）
- PWA: `https://tisly.jp/remote-test`
- デプロイ手順: `docs/remote-test-phase2-deploy.md`

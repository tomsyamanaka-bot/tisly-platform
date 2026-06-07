# TiSLY Remote Test — RP2350 最小ファームウェア

**目的:** PoE 起動だけで `https://tisly.jp` へ 3 秒ごとにポーリングし、PWA から CH1 ON/OFF を実行する。

| 項目 | 値 |
|------|-----|
| ボード | Waveshare RP2350-POE-ETH-8DI-8RO |
| MCU | Raspberry Pi Pico 2 (RP2350) |
| MicroPython | v1.28.0（Waveshare 同梱 UF2 推奨） |
| CH1 GPIO | 17（RO1 暫定） |
| ポーリング | 3 秒 |

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
[tisly] polling start (3 sec)

[tisly] heartbeat sent
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
| `polling start` | 3 秒ポーリング開始 |
| `heartbeat sent` | VPS へポーリング成功（接続時刻更新） |
| `command received: ch1_on` | コマンド受信 |
| `EXEC CH1 ON` | GPIO17 HIGH |
| `EXEC CH1 OFF` | GPIO17 LOW |
| `error: ...` | エラー内容 |

---

## トラブルシュート

| 症状 | 確認 |
|------|------|
| RP2350接続時刻が更新されない | Shell で `heartbeat sent` が出ているか / トークン一致 / VPS 稼働 |
| `error: AUTH 403` | `config.py` のトークン = VPS `REMOTE_TEST_TOKEN` |
| `error: urequests 未インストール` | 上記 mip 手順 |
| IP が取れない | PoE 給電・LAN ケーブル・`lib/` 配置 |
| HTTPS エラー | Waveshare MicroPython UF2（ssl 同梱版）を使用 |

---

## 関連

- VPS API: `GET /api/remote-test/command`（3 秒ポーリング）
- PWA: `https://tisly.jp/remote-test`
- デプロイ手順: `docs/remote-test-phase2-deploy.md`

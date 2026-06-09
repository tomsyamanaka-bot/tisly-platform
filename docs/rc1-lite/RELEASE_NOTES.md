# TiSLY Lite RC1 — リリースノート

**リリース名:** TiSLY Lite RC1 Freeze  
**Git Tag（予定）:** `rc1-lite-demo`  
**リリース日:** 2026-06-08  
**ファームウェア:** `1.4.0-remote-test-phase6`  
**本番 URL:** https://tisly.jp/remote-test

---

## 概要

TiSLY Lite RC1 は、**Waveshare RP2350-POE-ETH-8DI-8RO** と **iPhone PWA** を組み合わせた営業デモ用ホームセキュリティ PoC の凍結版である。Remote Test（CH 遠隔操作・heartbeat・Web Push）に Phase 6 の 8DI 読み取りと Security Demo Mode（警戒 ARM/DISARM・イベント履歴）を統合した。

**本リリースの位置づけ:** 新機能追加を停止し、営業デモ・実機展示に必要な機能のみを固定する **RC1 Freeze**。コード変更は Phase 7 着手まで原則禁止。

---

## 含まれる機能

### Remote Test 基盤（Phase 2〜3 / RC1）

| 機能 | 説明 |
|------|------|
| CH1〜CH8 遠隔操作 | PWA → VPS → RP2350 poll（3 秒）→ GPIO17〜24 |
| heartbeat | 60 秒周期 + 命令直後即時。`chStates` / `inputStates` 送信 |
| Web Push | VAPID による CH / DI 状態変化通知 |
| offline 判定 | 90 秒 heartbeat なしで offline 表示 |
| デバッグ API | `GET /api/remote-test/debug` |

### Phase 6 — 8DI

| 機能 | 説明 |
|------|------|
| DI1〜DI8 読み取り | GPIO9〜16、active-low |
| PWA DI カード | ON=緑 / OFF=グレー、5 秒ポーリング |
| DI 差分 Push | `DI{N} ON/OFF` 通知（ベースライン確立後） |

### Security Demo Mode

| 機能 | 説明 |
|------|------|
| 警戒 ON/OFF | `POST /arm` · `/disarm`、サーバー永続化 |
| センサー名称 | `security-demo.json` で DI1〜8 の用途名・通知文 |
| 警戒中のみ Push | DISARM 中の DI 変化は eventHistory のみ |
| 侵入シミュレーション | 配線なしで DI1 ON を疑似発生 |
| eventHistory | 最大 100 件（PWA は最新 20 件表示） |
| notificationHistory | Push 送信分のみ（最大 50 件） |

---

## バージョン履歴（Remote Test ライン）

| バージョン | マイルストーン |
|------------|----------------|
| `1.1.0-poc-success` | Phase 2 PoC（CH1・heartbeat） |
| `1.3.0-remote-test-rc1` | CH1〜8・差分 Push・RESET 同期 |
| **`1.4.0-remote-test-phase6`** | **8DI + Security Demo Mode（RC1 Freeze）** |

---

## コンポーネント一覧

| 層 | パス / 技術 |
|----|-------------|
| ファームウェア | `rp2350/firmware/main.py` · `config.py`（MicroPython） |
| VPS API | `server/src/remote-test/*`（Express / Node.js 20） |
| PWA | `server/public/remote-test.html` · `js/remote-test.js` |
| 設定 | `server/config/security-demo.json` |
| 永続化 | `server/data/remote-test-security-demo.json` |
| 通知 | Web Push（VAPID）· SQLite `notification_logs` |

---

## 既知の制限

| # | 制限 | 影響 |
|---|------|------|
| 1 | HTTP ポーリング（MQTT 未使用） | 命令応答最大約 3 秒 |
| 2 | 共有トークン `REMOTE_TEST_TOKEN` | 漏洩時は全 CH 操作可能 |
| 3 | 単一 RP2350 | `DEVICE_ID` 固定 |
| 4 | VPS 状態の一部インメモリ | 再起動で `confirmedChStates` 等リセット |
| 5 | 初回 heartbeat は通知なし | ベースライン確立のため |
| 6 | 命令キュー 1 件 | CH 連打は順次処理 |
| 7 | iOS Web Push | ホーム画面追加必須 |
| 8 | 警戒状態のみファイル永続化 | CH/DI ベースラインは再起動でリセット |

---

## アップグレード手順（VPS）

```bash
cd /opt/tisly && git pull origin master
cd /opt/tisly/server && npm run build
sudo systemctl restart tisly-server
```

ファームウェア更新時は Thonny で `main.py` + `config.py` を RP2350 に書き込み、RESET。

詳細: [remote-test-phase2-deploy.md](../remote-test-phase2-deploy.md)

---

## 検証コマンド

```bash
# サーバーユニットテスト
cd server && npm test -- test/remote-test.test.ts

# DI 統合シミュレーション（VPS 向け）
cd rp2350/test && python device_verify_di_test.py
```

---

## 参照ドキュメント

| ドキュメント | 内容 |
|--------------|------|
| [system-architecture.md](./system-architecture.md) | システム構成図 |
| [sales-demo-procedure.md](./sales-demo-procedure.md) | 営業デモ手順 |
| [wiring-diagram.md](./wiring-diagram.md) | 配線図 |
| [security-demo-mode.md](../security-demo-mode.md) | Security Demo 設計 |
| [phase6-8di-configuration.md](../phase6-8di-configuration.md) | 8DI 技術詳細 |
| [sales-demo-verdict.md](./sales-demo-verdict.md) | 営業デモ判定 |

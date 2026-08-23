# TiSLY Lite RC1 — デモ用 README

**リリース:** TiSLY Lite RC1 Freeze  
**Git Tag（予定）:** `rc1-lite-demo`  
**本番 URL:** https://tisly.jp/remote-test  
**ファームウェア:** `1.4.0-remote-test-phase6`

営業デモ・実機展示用のクイックリファレンスです。技術詳細は本フォルダ内の各ドキュメントを参照してください。

---

## 30 秒サマリー

TiSLY Lite は **RP2350 制御盤** と **iPhone PWA** で動くホームセキュリティデモです。専用アプリ不要。警戒 ON → 侵入検知 → スマホに即 Push、を配線なしでも再現できます。

**営業デモ判定:** ✅ 合格（2026-06-08）

---

## クイックスタート（営業担当）

### 1. iPhone 準備（初回のみ）

1. Safari で https://tisly.jp/remote-test を開く
2. 共有 → **ホーム画面に追加**
3. PWA を開き、**認証トークン**を入力（社内配布の `REMOTE_TEST_TOKEN`）
4. **Push 登録** → テスト通知が届くことを確認

### 2. 5 分デモ

| 順 | 操作 | 見せるもの |
|----|------|------------|
| 1 | 画面を開く | online · ファームウェア版 |
| 2 | CH1 ON/OFF | リレー LED + Push |
| 3 | **警戒ON** | Push「警戒ON」 |
| 4 | **侵入シミュレーション** | Push「侵入検知 / 駐車場センサー」 |
| 5 | **警戒OFF** | 以降は Push なしで履歴のみ |

詳細台本: [sales-demo-procedure.md](./sales-demo-procedure.md)

---

## クイックスタート（技術担当）

### RP2350 デモ機

| 項目 | 値 |
|------|-----|
| ボード | Waveshare RP2350-POE-ETH-8DI-8RO |
| ネットワーク | DHCP（LAN → インターネット） |
| ファーム | `rp2350/firmware/main.py` + `config.py` |
| バージョン | `1.4.0-remote-test-phase6` |

### VPS 反映

```bash
cd /opt/tisly && git pull origin master
cd /opt/tisly/server && npm run build
sudo systemctl restart tisly-server
```

### 動作確認

```bash
cd server && npm test -- test/remote-test.test.ts
```

---

## ドキュメント一覧

| ドキュメント | 用途 |
|--------------|------|
| [sales-demo-verdict.md](./sales-demo-verdict.md) | **営業デモ判定**（合格記録） |
| [RELEASE_NOTES.md](./RELEASE_NOTES.md) | RC1 リリースノート・既知の制限 |
| [system-architecture.md](./system-architecture.md) | **システム構成図** |
| [sales-demo-procedure.md](./sales-demo-procedure.md) | **営業デモ手順書**（10 分台本） |
| [wiring-diagram.md](./wiring-diagram.md) | **配線図**・GPIO マップ |
| [GIT_TAG_rc1-lite-demo.md](./GIT_TAG_rc1-lite-demo.md) | Git Tag 作成準備 |
| [phase7-candidates.md](./phase7-candidates.md) | **Phase 7 候補一覧** |

### 関連（リポジトリ既存）

| ドキュメント | 内容 |
|--------------|------|
| [security-demo-mode.md](../security-demo-mode.md) | ARM/DISARM 設計 |
| [phase6-8di-configuration.md](../phase6-8di-configuration.md) | 8DI 技術詳細 |
| [remote-test-phase2-deploy.md](../remote-test-phase2-deploy.md) | VPS デプロイ |
| [remote-test-final-report.md](../remote-test-final-report.md) | Remote Test RC1 レポート |

---

## RC1 Freeze ルール

| ルール | 説明 |
|--------|------|
| コード変更禁止 | hotfix 以外は Phase 7 まで凍結 |
| ドキュメントのみ可 | 本 `docs/rc1-lite/` フォルダの整備は許可 |
| デモ機ファーム固定 | `1.4.0-remote-test-phase6` を書き換えない |
| タグ参照 | 問題時は `rc1-lite-demo` タグに checkout |

---

## トラブル時

| 症状 | 最初に見るドキュメント |
|------|------------------------|
| Push が来ない | [sales-demo-procedure.md](./sales-demo-procedure.md) §7 |
| RP offline | [wiring-diagram.md](./wiring-diagram.md) §5 電源・LAN |
| 顧客向け説明 | [RELEASE_NOTES.md](./RELEASE_NOTES.md) §既知の制限 |
| 次に何を開発するか | [phase7-candidates.md](./phase7-candidates.md) |

---

## 連絡・エスカレーション

| 区分 | 担当 |
|------|------|
| VPS / tisly.jp | 智紀さん — [remote-test-phase2-deploy.md](../remote-test-phase2-deploy.md) |
| RP2350 実機 | ファーム `rp2350/firmware/` · Thonny 書き込み |
| 営業資料 | 本 README + [sales-demo-procedure.md](./sales-demo-procedure.md) |

---

**TiSLY Lite RC1 Freeze** — Phase 6 完了 · 営業デモ可 · 新機能は Phase 7 へ

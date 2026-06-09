# Git Tag `rc1-lite-demo` — 作成準備

**目的:** TiSLY Lite RC1 Freeze のスナップショットを Git タグで固定する。  
**タグ名:** `rc1-lite-demo`  
**対象コミット:** Phase 6 完了・営業デモ判定合格時点の `master` HEAD  
**実施日（予定）:** 2026-06-08

> **注意:** 本ドキュメントはタグ作成の**準備手順**である。タグの実際の作成はリポジトリ管理者が以下を確認したうえで実行する。

---

## 1. 凍結スコープ

### タグに含める（ドキュメント整備）

| パス | 内容 |
|------|------|
| `docs/rc1-lite/` | RC1 Freeze ドキュメント一式 |
| `docs/phase6-8di-configuration.md` | Phase 6 技術仕様 |
| `docs/security-demo-mode.md` | Security Demo 設計 |
| `docs/remote-test-final-report.md` | Remote Test RC1 レポート |

### タグが指すコード状態（変更禁止）

| パス | バージョン |
|------|------------|
| `rp2350/firmware/config.py` | `FIRMWARE_VERSION = "1.4.0-remote-test-phase6"` |
| `rp2350/firmware/main.py` | Phase 6 8DI + heartbeat |
| `server/src/remote-test/` | Security Demo + 8DI |
| `server/public/remote-test.*` | PWA RC1 |
| `server/config/security-demo.json` | センサー定義 |

### タグに含めない（.gitignore / 未追跡）

| パス | 理由 |
|------|------|
| `server/.env` | シークレット |
| `server/data/*.db` | ランタイム DB |
| `server/data/qnap-archive/` | イベントアーカイブ（環境依存） |
| `rp2350/test/*_results.json` | テスト結果ログ |

---

## 2. 作成前チェックリスト

| # | 項目 | コマンド / 確認 | ☐ |
|---|------|-----------------|---|
| 1 | 作業ツリー clean | `git status` — 意図しない変更なし | |
| 2 | 営業デモ判定合格 | [sales-demo-verdict.md](./sales-demo-verdict.md) | |
| 3 | ファームウェア版一致 | `1.4.0-remote-test-phase6` | |
| 4 | サーバーテスト pass | `cd server && npm test -- test/remote-test.test.ts` | |
| 5 | RC1 ドキュメント揃い | `docs/rc1-lite/` 7 ファイル以上 | |
| 6 | secret 未コミット | `.env` が git 追跡外 | |

---

## 3. タグ作成コマンド

### 3-1. アノテーション付きタグ（推奨）

```bash
cd /path/to/TiSLY_HOME_Security_DEMO

git tag -a rc1-lite-demo -m "$(cat <<'EOF'
TiSLY Lite RC1 Freeze — 営業デモ用スナップショット

Firmware: 1.4.0-remote-test-phase6
URL: https://tisly.jp/remote-test
Features: CH1-8, DI1-8, ARM/DISARM, intrusion sim, Web Push

Docs: docs/rc1-lite/
Verdict: sales demo PASS (2026-06-08)
EOF
)"
```

### 3-2. タグ確認

```bash
git show rc1-lite-demo --no-patch
git tag -l "rc1-lite*"
```

### 3-3. リモートへ push（管理者承認後）

```bash
git push origin rc1-lite-demo
```

---

## 4. タグメッセージ（全文）

```
TiSLY Lite RC1 Freeze — 営業デモ用スナップショット

Firmware: 1.4.0-remote-test-phase6
URL: https://tisly.jp/remote-test
Features: CH1-8, DI1-8, ARM/DISARM, intrusion sim, Web Push

Docs: docs/rc1-lite/
Verdict: sales demo PASS (2026-06-08)
```

---

## 5. タグ作成後の運用ルール

| ルール | 説明 |
|--------|------|
| **Freeze** | `rc1-lite-demo` 以降、RC1 スコープのコード変更は hotfix のみ |
| **hotfix** | 営業デモ不能な障害のみ。`rc1-lite-demo-hotfix.N` で別タグ |
| **Phase 7** | 新機能は `master` 上でブランチ開発。RC1 タグは参照用に維持 |
| **ファーム** | デモ機はタグ時点の `config.py` を書き込み済みであること |

---

## 6. ロールバック手順（デモ機復元）

タグ時点のファームウェアに戻す場合:

```bash
git checkout rc1-lite-demo -- rp2350/firmware/main.py rp2350/firmware/config.py
# Thonny で RP2350 に書き込み → RESET
```

VPS をタグ時点のサーバーに合わせる場合:

```bash
cd /opt/tisly
git fetch origin tag rc1-lite-demo
git checkout rc1-lite-demo -- server/
cd server && npm run build
sudo systemctl restart tisly-server
```

---

## 7. 関連タグ（参考）

| タグ | 用途 |
|------|------|
| `rc1-lite-demo` | **本タグ** — TiSLY Lite 営業デモ Freeze |
| （将来）`rc1-lite-demo-hotfix.1` | RC1 緊急修正 |
| （将来）`phase7-dev` | Phase 7 開発起点 |

---

## 8. 署名

| 項目 | 値 |
|------|-----|
| 準備ドキュメント作成 | 2026-06-08 |
| タグ作成者 | _（実行時に記入）_ |
| タグ SHA | _（`git rev-parse rc1-lite-demo` で記入）_ |

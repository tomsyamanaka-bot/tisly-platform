# Phase 1921–1960 — Production Launch Verification & Browser Test

**智紀さん向け · tisly.jp 本番起動後の確認手順**

> 前提: `/opt/tisly` clone 済み · `.env` 入力済み · `scripts/vps-production-start.sh` は GitHub 上に存在  
> 関連: [`vps_phase1881_launch.md`](./vps_phase1881_launch.md) · [`production_url_checklist.md`](./production_url_checklist.md) · Web UI `/deployment/checklist`

---

## 実行フロー（概要）

```
VNC root ログイン
  → git pull + bash scripts/vps-production-start.sh
  → 起動後コマンド確認（systemd · nginx · health）
  → certbot（HTTPS 未設定時のみ）
  → ブラウザで /deployment/checklist「再確認」
  → https://tisly.jp/app を最優先で開く
```

---

## A. 智紀が確認する URL

優先順に開いてください。

| 優先 | URL | 確認内容 |
|:----:|-----|----------|
| **1** | https://tisly.jp/app | App Hub · 白画面なし · Production Readiness 表示 |
| **2** | https://tisly.jp/deployment/checklist | Rehearsal グリッド · 9 URL 一覧 · PWA 監査 |
| **3** | https://tisly.jp/api/health | `{"ok":true,...}` |
| 4 | https://tisly.jp/survey | 現調 PWA 表示 |
| 5 | https://tisly.jp/business | TOMS Business 表示 |
| 6 | https://tisly.jp/sales | 営業デモ表示 |
| 7 | https://tisly.jp/customer/TOMS001 | 顧客ポータル |
| 8 | https://tisly.jp/customer/TOMS001/pro-remote | PRO Remote |
| 9 | https://tisly.jp/customer/TOMS001/install/home | 施工 PWA |
| 10 | https://tisly.jp/tv/TOMS001 | Google TV Web |

---

## B. 成功判定

### B-1. VPS 起動スクリプト完了時

| 確認 | 期待される結果 |
|------|----------------|
| スクリプト末尾 | `[TiSLY start] === 本番起動完了 ===` |
| `systemctl is-active tisly-server` | `active` |
| `curl -s http://127.0.0.1:3080/api/health` | `{"ok":true,...}` |
| `nginx -t` | `syntax is ok` · `test is successful` |
| `curl -sI http://tisly.jp/app` | `HTTP/1.1 301`（HTTPS リダイレクト）または `HTTP/2 200` |

### B-2. `/deployment/checklist` の Rehearsal グリッド

ページを開き **「再確認」** を押したあと、以下 3 行が **緑の左ボーダー** であること。

| 表示ラベル | 期待 status | 意味 |
|------------|-------------|------|
| **VPS DEPLOYED** | `deployed` | `tisly-server` が systemd active |
| **SSL READY** | `checked` | certbot 証明書 `tisly.jp` あり |
| **PWA installReady N/N** | `ready` | 全 PWA が manifest · SW 監査合格（N は監査対象数） |

補足: `VPS NOT DEPLOYED` / `SSL NOT CHECKED` はローカル開発や certbot 未実施時に出ます。本番 VPS では上記 3 つが緑になることが目標です。

### B-3. 9 URL 一覧（チェックリストページ内）

| 項目 | 合格 |
|------|------|
| 9 URL すべて | バッジ「合格」· HTTP 200 |
| 白画面・無限ロード | なし |
| ブラウザコンソール | 連続 401/500 なし |

### B-4. 総合判定

**LAUNCH VERIFIED** — 以下すべて満たす:

1. B-1 の VPS 起動確認がすべて OK
2. B-2 の Rehearsal 3 行（VPS DEPLOYED · SSL READY · PWA installReady）が緑
3. B-3 の 9 URL が PC ブラウザで表示 OK
4. https://tisly.jp/app が最優先で正常表示

---

## C. 失敗時のコマンド

### C-0. 本番起動（まだ実行していない場合）

```bash
cd /opt/tisly && git pull && test -f scripts/vps-production-start.sh || { echo "ERROR: scripts/vps-production-start.sh なし — git remote/branch を確認"; ls -la scripts/ 2>/dev/null; exit 1; } && bash scripts/vps-production-start.sh
```

### C-1. 起動後の基本確認

```bash
systemctl status tisly-server
journalctl -u tisly-server -n 80 --no-pager
nginx -t
curl -s http://127.0.0.1:3080/api/health
curl -sI https://tisly.jp/app | head -5
curl -sI https://tisly.jp/deployment/checklist | head -3
```

### C-2. チェックリスト API で VPS / SSL / PWA 確認

```bash
curl -s https://tisly.jp/api/deploy/rehearsal-checklist | grep -E '"id":"(vps|ssl|pwa)"' -A3
```

### C-3. 9 URL 一括スモーク

```bash
BASE=https://tisly.jp
for path in /app /survey /business /sales /customer/TOMS001 /customer/TOMS001/pro-remote /customer/TOMS001/install/home /tv/TOMS001 /deployment/checklist; do
  code=$(curl -sI -o /dev/null -w "%{http_code}" "${BASE}${path}")
  echo "${path} → HTTP ${code}"
done
```

### C-4. 症状別対処

| 症状 | 確認コマンド | 対処 |
|------|-------------|------|
| **502 Bad Gateway** | `systemctl is-active tisly-server` · `curl -s http://127.0.0.1:3080/api/health` · `journalctl -u tisly-server -n 50` | `systemctl restart tisly-server` → localhost health OK 後 `systemctl reload nginx` |
| **nginx error**（`nginx -t` 失敗） | `nginx -t` · `ls -la /etc/nginx/sites-enabled/` | `cp /opt/tisly/server/deploy/nginx/tisly.jp.conf /etc/nginx/sites-available/tisly.jp` → `nginx -t` → `systemctl reload nginx` |
| **systemd inactive** | `systemctl status tisly-server` · `journalctl -u tisly-server -n 80` · `ss -tlnp \| grep 3080` | ログのエラーを修正 → `cd /opt/tisly/server && npm run build` → `systemctl restart tisly-server` |
| **certbot 未実施**（HTTPS 接続不可） | `certbot certificates` · `curl -sI http://tisly.jp/app \| head -5` | `certbot --nginx -d tisly.jp -d www.tisly.jp` → `nginx -t` → `systemctl reload nginx` |
| **VPS NOT DEPLOYED**（チェックリスト） | `systemctl is-active tisly-server` | `bash scripts/vps-production-start.sh` を再実行、または `systemctl restart tisly-server` |
| **SSL NOT CHECKED**（チェックリスト） | `certbot certificates` | C-4 certbot 行を実行 |
| **PWA installReady 未達** | チェックリストの PWA セクションで失敗行を確認 | `journalctl` で 500 確認 · `npm run build` 後再起動 · manifest/SW 404 がないか 9 URL で確認 |

共通ログ:

```bash
journalctl -u tisly-server -n 80 --no-pager
systemctl status tisly-server
nginx -t
```

ロールバック: [`rollback_guide.md`](./rollback_guide.md) · `bash scripts/rollback.sh`

---

## D. 次フェーズ提案

| Phase | 内容 |
|-------|------|
| **1961–2000** | iPhone Safari / Android Chrome で PWA「ホーム画面に追加」・ standalone 起動の実機確認 |
| **1961–2000** | Google TV ブラウザで `/tv/TOMS001` のリモコン操作・ WebSocket 確認 |
| **1961–2000** | 初回顧客トライアル — `docs/first_customer_trial_runbook.md` |
| **2001+** | mock → real 連携切替計画（MQTT · QNAP · Gmail）は別フェーズ |
| **2001+** | 監視: `journalctl -u tisly-server -f` · `certbot renew --dry-run` 定期確認 |

---

## デプロイ記録（成功時に記入）

| 項目 | 値 |
|------|-----|
| 実施日 | _______________ |
| 実施者 | 智紀 |
| git コミット | `git -C /opt/tisly rev-parse --short HEAD` の出力 |
| 総合判定 | ☐ LAUNCH VERIFIED　☐ NOT READY |
| メモ | _______________ |

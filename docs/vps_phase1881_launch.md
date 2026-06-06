# Phase 1881–1920 — VPS Launch Gap Fix & Real Production Start

**智紀さん向け · tisly.jp 本番公開（git pull ギャップ修正版）**

> VNC コンソールから **root** で実行。秘密値は表示しません。

---

## A. VPSで最初に貼るコマンド

```bash
cd /opt/tisly && git pull && test -f scripts/vps-production-start.sh || { echo "ERROR: scripts/vps-production-start.sh なし — git remote/branch を確認"; ls -la scripts/ 2>/dev/null; exit 1; } && bash scripts/vps-production-start.sh
```

---

## B. scripts/vps-production-start.sh の存在

| 場所 | 状態 |
|------|------|
| GitHub `origin/master` | **存在する** (`scripts/vps-production-start.sh`) |
| VPS `/opt/tisly/scripts/` | `git pull` 後に上記コマンドで確認 |

---

## C. 成功時の表示

| 確認 | 期待される結果 |
|------|----------------|
| `systemctl is-active tisly-server` | `active` |
| `curl http://127.0.0.1:3080/api/health` | `{"ok":true,...}` |
| `nginx -t` | `syntax is ok` · `test is successful` |
| `curl -I http://tisly.jp/app` | `HTTP/1.1 301`（HTTPS リダイレクト）または `HTTP/2 200` |
| スクリプト末尾 | `[TiSLY start] === 本番起動完了 ===` |

---

## D. 失敗時の確認コマンド

```bash
# スクリプト自体がない
cd /opt/tisly && git remote -v && git branch && git pull && ls -la scripts/vps-production-start.sh

# Node / systemd
systemctl status tisly-server
journalctl -u tisly-server -n 80 --no-pager
ss -tlnp | grep 3080
curl -v http://127.0.0.1:3080/api/health

# nginx
nginx -t
ls -la /etc/nginx/sites-enabled/
cat /etc/nginx/sites-available/tisly.jp | head -20

# SSL 未設定（HTTPS が開けない場合のみ）
certbot --nginx -d tisly.jp -d www.tisly.jp
```

| 症状 | 対処 |
|------|------|
| `No such file or directory`（スクリプト） | `git pull` → A のコマンド再実行 |
| `.env 不足` で exit 1 | `nano /opt/tisly/server/.env` → 必須キー入力 → 再実行 |
| `tisly-server` が inactive | `journalctl -u tisly-server -n 80` で原因確認 → `systemctl restart tisly-server` |
| `nginx -t` エラー | `cp /opt/tisly/server/deploy/nginx/tisly.jp.conf /etc/nginx/sites-available/tisly.jp` → `nginx -t` |
| `https://tisly.jp` 接続不可 | `certbot --nginx -d tisly.jp` |

---

## E. 次に開くURL

1. **https://tisly.jp/app** — App Hub（本番 PWA 入口）
2. **https://tisly.jp/deployment/checklist** — 公開チェックリスト
3. **https://tisly.jp/api/health** — API ヘルス

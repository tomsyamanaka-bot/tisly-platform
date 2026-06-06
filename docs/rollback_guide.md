# ロールバック手順 — tisly.jp 本番

**Phase 1541–1580** · デプロイ後に不具合が出たとき、**直前の git コミット**へ戻す手順です。

---

## いつ使うか

- `npm run release:gate` は通ったが、公開後に 502 / 白画面 / API エラー
- 意図しないコミットを `git pull` してしまった
- PWA が壊れて顧客デモに使えない

---

## 方法 A — スクリプト（推奨）

VPS で:

```bash
cd /opt/tisly
bash scripts/rollback.sh
```

スクリプトが行うこと:

1. デプロイ前バックアップ（`npm run deploy:backup`）
2. `git reset --hard HEAD~1`（直前コミットへ）
3. `npm ci` → `npm run build`
4. `systemctl restart tisly-server`
5. `nginx -t` → `systemctl reload nginx`
6. `curl` で health / 主要 URL 確認

---

## 方法 B — 手動（スクリプトが失敗したとき）

```bash
cd /opt/tisly/server
npm run deploy:backup || true

cd /opt/tisly
git log -2 --oneline
git reset --hard HEAD~1

cd server
npm ci
npm run build

sudo systemctl restart tisly-server
sudo nginx -t && sudo systemctl reload nginx
```

---

## 方法 C — Deploy Center API（`DEPLOY_OPS_TOKEN` 必要）

```bash
curl -sS -X POST "https://tisly.jp/api/deploy/rollback" \
  -H "X-Deploy-Ops-Token: <DEPLOY_OPS_TOKEN>"
```

**✋ 智紀さんが入力:** `<DEPLOY_OPS_TOKEN>` は `.env` の値（他人に見せない）。

VPS では `DEPLOY_ROLLBACK_EXEC=true` を `.env` に設定しないと API は記録のみでスクリプトは実行されません。  
本番では **方法 A** を推奨します。

---

## ロールバック後の確認 URL

```bash
BASE=https://tisly.jp
curl -sf "${BASE}/api/health"
curl -sI "${BASE}/app" | head -3
curl -sI "${BASE}/survey" | head -3
curl -sI "${BASE}/deployment/checklist" | head -3
```

ブラウザ:

```
https://tisly.jp/deployment/checklist
```

9 URL がすべて合格になるまで再確認してください。

---

## それでも直らないとき

| 症状 | 確認 |
|------|------|
| 502 継続 | `journalctl -u tisly-server -n 80` |
| nginx エラー | `sudo nginx -t` · `/var/log/nginx/error.log` |
| DB 破損疑い | `server/data/` のバックアップから復元（`deploy:backup` 出力先） |
| 証明書 | `certbot certificates` |

2 コミット以上戻す必要がある場合は、戻したいコミット SHA を指定:

```bash
cd /opt/tisly
git log --oneline -10
git reset --hard <戻したいコミットSHA>
cd server && npm ci && npm run build
sudo systemctl restart tisly-server
sudo nginx -t && sudo systemctl reload nginx
```

**注意:** `git reset --hard` は作業ツリーを破棄します。未コミット変更は失われます。

---

## 関連

- 初回投入: [`vps_first_launch_for_tomonori.md`](./vps_first_launch_for_tomonori.md)
- 確認コマンド: [`production_check_commands.md`](./production_check_commands.md)

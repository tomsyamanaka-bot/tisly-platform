# TiSLY 本番前チェックリスト（VPS 投入前）

**Phase 1441–1460 — VPS Real Deploy Preparation**

人間が VPS 投入直前に確認するチェックリストです。  
API 監査: `GET /api/deploy/preflight` · アプリ確認: `https://tisly.jp/app`（VPS Deploy Status が **READY FOR DEPLOY**）

---

## リポジトリ・ビルド

- [ ] `git pull` — 最新コードを取得
- [ ] `npm ci` — 依存関係をクリーンインストール（`cd server`）
- [ ] `npm run build` — TypeScript ビルド（`dist/` 生成）
- [ ] `npx tsc --noEmit` — 型チェック
- [ ] `npm run test` — 全テスト pass
- [ ] `npm run release:gate` — Release Gate 合格
- [ ] `npm run deploy:dry-run` — dry-run fail 0

## 環境変数（`.env`）

- [ ] `env` — `.env.production.example` をベースに VPS 用 `.env` を配置
- [ ] `NODE_ENV=production`
- [ ] `TISLY_PUBLIC_URL=https://tisly.jp`
- [ ] `JWT_SECRET` — `openssl rand -hex 32` で生成済み
- [ ] `ADMIN_PASSWORD_HASH` — 管理者パスワードハッシュ設定済み
- [ ] `INGEST_SECRET` — デフォルト値でないこと
- [ ] `DB_PROVIDER` — 初回は `sqlite`、安定後 `postgres` 推奨
- [ ] 初回公開は mock 維持: `GMAIL_SEND_MODE=mock`, `MQTT_MODE=mock`, `SHELLY_MODE=mock`, `SWITCHBOT_MODE=mock`, `QNAP_MODE=mock`

## インフラ

- [ ] `nginx` — `server/deploy/nginx/tisly.jp.conf` を配置・`nginx -t` 合格
- [ ] `ssl` — Let's Encrypt 証明書取得・HTTPS リダイレクト確認
- [ ] `systemd` — `server/deploy/systemd/tisly-server.service` 有効化・起動
- [ ] `health` — `GET /api/health` が `status: ok`、database / websocket / productionUrl 確認

## 本番ルート動作確認

- [ ] `app` — `https://tisly.jp/app` — VPS Deploy Status 全緑・READY FOR DEPLOY
- [ ] `survey` — `https://tisly.jp/survey`
- [ ] `business` — `https://tisly.jp/business`
- [ ] `installer` — `https://tisly.jp/installer`
- [ ] `customer` — `https://tisly.jp/customer`
- [ ] `pro-remote` — `https://tisly.jp/pro-remote`
- [ ] `tv` — `https://tisly.jp/tv/TOMS001`（Google TV 専用）

---

## 参考コマンド（VPS 上）

```bash
cd /opt/tisly
git pull
cd server
npm ci
npm run release:gate
sudo systemctl restart tisly-server
curl -s https://tisly.jp/api/health | jq .
curl -s https://tisly.jp/api/deploy/preflight | jq .
```

## 関連ドキュメント

- [release_gate.md](./release_gate.md)
- [tisly_vps_deploy_step_by_step.md](./tisly_vps_deploy_step_by_step.md)
- [deploy_report_template.md](./deploy_report_template.md)

# TiSLY Platform — Production Deployment Rehearsal

**Phase 1581–1620** · ConoHa VPS 投入前の本番同等総点検

## 目的

VPS（ConoHa）へ投入する前に、TiSLY 全 PWA を本番同等環境で総点検し、**公開できるかだけ**を判定する。新しい業務機能は作らない。

対象 PWA:

| ID | ルート |
|----|--------|
| app | `/app` |
| survey | `/survey` |
| business | `/business` |
| sales | `/sales` |
| customer | `/customer/TOMS001` |
| pro-remote | `/customer/TOMS001/pro-remote` |
| install | `/customer/TOMS001/install/home` |
| deployment | `/deployment/checklist` |
| tv | `/tv/TOMS001` |

---

## 実行方法

### 1. ローカル / VPS 上でサーバー起動

```bash
cd server
npm ci
npm run build
npm run dev   # または systemctl start tisly
```

### 2. CLI で品質ゲート（必須）

リポジトリルートまたは `server/` から:

```bash
cd server
npm run build
npx tsc --noEmit
npm run test
npm run release:gate
npm run deploy:dry-run
```

### 3. API でリハーサル実行

| API | 内容 |
|-----|------|
| `GET /api/deploy/simulate` | 総合シミュレーション（release gate / health / build / nginx / ws / pwa / env） |
| `GET /api/deploy/url-check` | 9 ルート × HTTP / manifest / SW / icon |
| `GET /api/deploy/pwa-audit` | PWA 監査（installReady / manifest / sw / offline cache / standalone / icon） |
| `GET /api/deploy/tv-audit` | Google TV 監査（route / focus API / camera focus / ws） |
| `GET /api/deploy/security-audit` | Security 監査（.env / jwt / secret / admin hash / debug / mock） |

例:

```bash
curl -s http://localhost:3080/api/deploy/simulate | jq '.verdict, .readyScore'
```

### 4. UI で確認

`/app` を開き **Deployment Summary** カードを確認する。

- Ready Score（例: `97/100 — READY FOR PRODUCTION`）
- Build / Health / Release Gate / PWA / TV / Security / URL / READY率
- NG 項目一覧

---

## Ready Score（100 点満点）

| カテゴリ | 配点 | 判定基準 |
|----------|------|----------|
| Build | 15 | `dist/index.js` 存在または release gate marker |
| Test | 15 | `npm run test` 合格（release-gate-last.json） |
| Release | 15 | dry-run + release gate 合格 |
| PWA | 20 | 7 PWA の installReady 比率 |
| TV | 10 | TV 4 チェック（route / focus API / camera focus / ws） |
| Security | 15 | .env 例・JWT・secret・admin hash・debug・mock |
| Health | 10 | health probe（DB + HTTPS） |

表示ラベル:

| スコア | ラベル |
|--------|--------|
| 97–100 | `READY FOR PRODUCTION` |
| 85–96 | `ALMOST READY` |
| 0–84 | `NOT READY FOR PRODUCTION` |

総合判定 `READY` の条件:

- Ready Score ≥ 90
- dry-run 合格
- security-audit `READY`
- url-check 全 9 ルート `READY`

---

## 合格条件

- `GET /api/deploy/simulate` → `verdict: "READY"`
- Ready Score ≥ 90（理想は 97+）
- `npm run release:gate` が exit 0
- `npm run deploy:dry-run` が exit 0
- url-check: 9/9 ルート READY
- pwa-audit: 7/7 PWA READY
- tv-audit: 4/4 チェック pass（ws は warn 許容）
- security-audit: JWT / INGEST_SECRET / ADMIN_PASSWORD_HASH 設定済み
- `/app` Deployment Summary に NG 項目なし

---

## 不合格条件

以下のいずれかで **NOT READY**:

| 区分 | 例 |
|------|-----|
| Build | `dist/index.js` なし |
| Test | release gate 未実行 |
| Release | dry-run fail > 0 |
| PWA | manifest / SW / icon 不足 |
| URL | 公開コードに localhost / ws:// 残存 |
| Security | JWT_SECRET デフォルト値、DEMO_RESET_ENABLED=true |
| Health | DB 接続不可 |
| nginx | `/ws` または RC2 ルート未定義 |

---

## VPS 投入 GO 判定

**GO（VPS デプロイ可）** — すべて満たす:

1. `npm run release:gate` 合格
2. `/api/deploy/simulate` → `verdict: "READY"`
3. Ready Score ≥ 90
4. `.env.production` に本番 secret を設定済み（git に含めない）
5. `TISLY_PUBLIC_URL=https://tisly.jp`
6. 智紀さんが VPS 初回起動手順を完了（`docs/vps_first_launch_for_tomonori.md`）

**NO-GO** — 上記のいずれか未達。コード修正 → 再 `release:gate` → 再 `simulate`。

---

## 智紀さんがやる作業（VPS 側）

1. ConoHa VPS へ SSH ログイン
2. `/opt/tisly` にリポジトリ clone
3. `docs/env_fill_in_guide.md` に従い `.env.production` を記入
4. `npm ci && npm run build && npm run release:gate`
5. `npm run db:init`（初回のみ）
6. nginx + certbot 設定（`docs/nginx_tisly_production.md`）
7. `systemctl enable --now tisly`
8. ブラウザで `https://tisly.jp/app` → Deployment Summary が READY であることを確認
9. 実機（iPhone / Android TV）で各 PWA のホーム画面追加を確認
10. `docs/vps_first_launch_for_tomonori.md` のチェックリストを完了

---

## 開発者が VPS 投入前に残す作業

- `npm run release:gate` を CI / ローカルで合格させる
- NG 項目を `/api/deploy/simulate` でゼロにする
- secret を `.env.production.example` テンプレートのみに残す（実値は git 外）
- `docs/production_rehearsal.md`（本書）の合格条件を満たすことを PR で確認

---

## 関連ドキュメント

- [release_gate.md](./release_gate.md)
- [production_routes.md](./production_routes.md)
- [nginx_tisly_production.md](./nginx_tisly_production.md)
- [vps_first_launch_for_tomonori.md](./vps_first_launch_for_tomonori.md)
- [env_fill_in_guide.md](./env_fill_in_guide.md)

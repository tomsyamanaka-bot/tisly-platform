# VPS 自動デプロイ（GitHub push → ConoHa VPS）

`master` へ push すると GitHub Actions が ConoHa VPS へ SSH 接続し、本番更新を自動実行します。

## 自動デプロイの流れ

```mermaid
flowchart LR
  A[Cursor で修正] --> B[git commit & push master]
  B --> C[GitHub Actions deploy-vps.yml]
  C --> D[SSH → VPS]
  D --> E[scripts/deploy-vps.sh]
  E --> F[git fetch & reset / npm install / build]
  F --> G[systemctl restart tisly-server]
  G --> H[/api/health で commitShort 確認]
  H --> I[成功 or Actions 失敗]
```

1. `master` への push で `.github/workflows/deploy-vps.yml` が起動
2. GitHub Actions が VPS へ SSH
3. VPS 上で `bash /opt/tisly/scripts/deploy-vps.sh` を実行
4. スクリプトが `git fetch origin` → `git reset --hard origin/master` → `npm install` → `npm run build` → `release-gate-last.json` 同期確認 → `systemctl restart` → health 確認（`server/data/*.json` は Git 管理外のためローカルデータで止まらない）
5. Actions 側でも `https://tisly.jp/api/health` の `commitShort` が push した commit と一致するか再確認
6. いずれかが失敗したら GitHub Actions を **失敗** 扱いにする

---

## GitHub Secrets 登録手順（超わかりやすく）

### 画面の場所

1. GitHub で **このリポジトリ** を開く
2. 上部タブ **Settings**（リポジトリ設定）
3. 左メニュー **Secrets and variables** → **Actions**
4. 緑ボタン **New repository secret** をクリック
5. 下表の 4 項目を **1 つずつ** 登録（Name と Secret を入力 → **Add secret**）

### 登録する Secrets（4 項目）

| Secret 名 | 内容 | 例 |
|-----------|------|-----|
| `VPS_HOST` | VPS の IP またはホスト名 | `xxx.xxx.xxx.xxx` |
| `VPS_USER` | SSH ログインユーザー | `tisly` |
| `VPS_SSH_KEY` | 秘密鍵（PEM 全文） | `-----BEGIN OPENSSH PRIVATE KEY-----` … |
| `VPS_PORT` | SSH ポート（省略可・未設定なら **22**） | `22` |

### 秘密鍵の作り方（初回のみ）

```bash
# ローカル or VPS 管理端末
ssh-keygen -t ed25519 -C "github-actions-tisly-deploy" -f ./tisly-deploy-key -N ""

# 公開鍵を VPS に登録（VPS_USER のホームへ）
ssh-copy-id -i ./tisly-deploy-key.pub tisly@<VPS_HOST>

# 秘密鍵の中身を GitHub Secret VPS_SSH_KEY に貼り付け
cat ./tisly-deploy-key
```

**注意:** `VPS_SSH_KEY` には `-----BEGIN` から `-----END` まで **改行込みで全文** を貼り付けてください。

### Secrets 未設定のとき

Actions ログに不足している Secret 名が表示され、ワークフローは即失敗します。上記 4 項目を登録してから再実行してください。

---

## GitHub Actions 手動実行（workflow_dispatch）

push 以外に、GitHub 画面から手動デプロイもできます。

1. リポジトリの **Actions** タブを開く
2. 左メニュー **VPS Auto Deploy** を選択
3. 右側 **Run workflow** をクリック
4. ブランチ `master` を選び、必要なら ref を指定（省略時は `master`）
5. **Run workflow** で実行

ログの **Deploy summary** に commitShort と health URL が表示されます。

---

## VPS で初回だけ人間がやる作業

### 1. リポジトリ clone（未済の場合）

```bash
sudo mkdir -p /opt/tisly
sudo chown tisly:tisly /opt/tisly
git clone <リポジトリURL> /opt/tisly
cd /opt/tisly
git checkout master
```

### 2. server/.env を本番用に設定

`server/.env.production.example` を参照して本番用 `.env` を配置します。

### 3. deploy スクリプトを実行可能にする

```bash
chmod +x /opt/tisly/scripts/deploy-vps.sh
```

### 4. sudo 権限（パスワードなし systemctl）

`sudo systemctl restart tisly-server` でパスワードを聞かれる場合、以下を実行します。

```bash
# systemctl の実際のパスを確認
which systemctl
# 例: /bin/systemctl

sudo visudo -f /etc/sudoers.d/tisly-deploy
```

ファイルに 1 行追加（`tisly` は `VPS_USER` の実際のユーザー名に置き換え）:

```
tisly ALL=NOPASSWD: /bin/systemctl restart tisly-server, /bin/systemctl status tisly-server
```

**`which systemctl` の結果が `/usr/bin/systemctl` など別パスの場合は、そのパスを visudo に書いてください。**

**デプロイユーザーが `root` の場合:** `sudo` 設定は不要です（root はそのまま `systemctl restart` できます）。

動作確認:

```bash
sudo systemctl status tisly-server
sudo systemctl restart tisly-server   # パスワードを聞かれなければ OK
```

### 5. GitHub Secrets を 4 項目登録

上記「GitHub Secrets 登録手順」を完了してください。

### 6. 手動で 1 回テスト（推奨）

```bash
bash /opt/tisly/scripts/deploy-vps.sh
curl -s https://tisly.jp/api/health | grep commitShort
```

末尾に `DEPLOY OK` と表示され、health の `commitShort` が `git rev-parse --short HEAD` と一致すれば成功です。

### 7. 以降は push だけ

このドキュメントを含む変更を `master` に push すると、以降は Actions が自動デプロイします。

---

## 成功確認方法

### 確認 URL

**https://tisly.jp/api/health**

レスポンス JSON の `commitShort`（または `buildVersion.commitShort`）が、GitHub の最新 commit の **先頭 7 文字** と一致すればデプロイ成功です。

```bash
# VPS またはローカルから
curl -s https://tisly.jp/api/health | grep commitShort

# GitHub 最新 commit の先頭 7 文字と比較
cd /opt/tisly && git rev-parse --short HEAD
```

GitHub Actions の **VPS Auto Deploy** ワークフローが緑（成功）で、上記 URL の `commitShort` も一致していれば完了です。

---

## 失敗したときの確認コマンド（VPS に SSH して実行）

```bash
# サービス状態
sudo systemctl status tisly-server

# 直近ログ
journalctl -u tisly-server -n 80 --no-pager

# 手動デプロイ再試行
cd /opt/tisly && bash scripts/deploy-vps.sh

# health / commit
curl -s https://tisly.jp/api/health | grep commitShort

# git の状態
cd /opt/tisly && git log -1 --oneline && git status -sb
```

GitHub 側: リポジトリの **Actions** タブ → **VPS Auto Deploy** ワークフローのログを確認。

---

## 自動デプロイ後に iPhone で見る URL

| 用途 | URL |
|------|-----|
| PWA ハブ | https://tisly.jp/app |
| ヘルス（commit 確認） | https://tisly.jp/api/health |
| 本番トップ | https://tisly.jp/ |

---

## 次回以降の作業

**智紀さんがやることは Cursor で修正 → Commit & Push（`master`）だけで OK です。**

VPS への SSH、`git fetch` / `git reset`、`npm run build`、`systemctl restart` は **不要** です（GitHub Actions が自動実行します）。

---

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `.github/workflows/deploy-vps.yml` | GitHub Actions ワークフロー |
| `scripts/deploy-vps.sh` | VPS 上で実行するデプロイスクリプト |
| `.github/workflows/deploy.yml` | CI（release gate）— VPS デプロイは `deploy-vps.yml` を使用 |

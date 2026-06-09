# VPS 自動デプロイ（GitHub push → ConoHa VPS）

`master` へ push すると GitHub Actions が ConoHa VPS へ SSH 接続し、本番更新を自動実行します。

## 自動デプロイの流れ

```mermaid
flowchart LR
  A[Cursor で修正] --> B[git commit & push master]
  B --> C[GitHub Actions deploy-vps.yml]
  C --> D[SSH → VPS]
  D --> E[scripts/deploy-vps.sh]
  E --> F[git pull / npm install / build]
  F --> G[systemctl restart tisly-server]
  G --> H[/api/health で commitShort 確認]
  H --> I[成功 or Actions 失敗]
```

1. `master` への push で `.github/workflows/deploy-vps.yml` が起動
2. GitHub Actions が VPS へ SSH
3. VPS 上で `bash /opt/tisly/scripts/deploy-vps.sh` を実行
4. スクリプトが `git pull` → `npm install` → `npm run build` → `systemctl restart` → health 確認
5. Actions 側でも `https://tisly.jp/api/health` の `commitShort` が push した commit と一致するか再確認
6. いずれかが失敗したら GitHub Actions を **失敗** 扱いにする

## GitHub Secrets（リポジトリ Settings → Secrets and variables → Actions）

| Secret 名 | 内容 | 例 |
|-----------|------|-----|
| `VPS_HOST` | VPS の IP またはホスト名 | `xxx.xxx.xxx.xxx` |
| `VPS_USER` | SSH ログインユーザー | `tisly` |
| `VPS_SSH_KEY` | 秘密鍵（PEM 全文） | `-----BEGIN OPENSSH PRIVATE KEY-----` … |
| `VPS_PORT` | SSH ポート（省略時 **22**） | `22` |

### 秘密鍵の作り方（初回のみ）

VPS でデプロイ用ユーザーを作り、公開鍵を `authorized_keys` に登録します。

```bash
# ローカル or VPS 管理端末
ssh-keygen -t ed25519 -C "github-actions-tisly-deploy" -f ./tisly-deploy-key -N ""

# 公開鍵を VPS に登録（VPS_USER のホームへ）
ssh-copy-id -i ./tisly-deploy-key.pub tisly@<VPS_HOST>

# 秘密鍵の中身を GitHub Secret VPS_SSH_KEY に貼り付け
cat ./tisly-deploy-key
```

## VPS で初回だけ人間がやる作業

1. **リポジトリ clone（未済の場合）**

   ```bash
   sudo mkdir -p /opt/tisly
   sudo chown tisly:tisly /opt/tisly
   git clone <リポジトリURL> /opt/tisly
   cd /opt/tisly
   git checkout master
   ```

2. **server/.env を本番用に設定**（`server/.env.production.example` 参照）

3. **deploy スクリプトを実行可能にする**

   ```bash
   chmod +x /opt/tisly/scripts/deploy-vps.sh
   ```

4. **sudo 権限（パスワードなし restart）**

   `sudo systemctl restart tisly-server` でパスワードを聞かれる場合、visudo で以下を追加します。
   **実際のパスは VPS で `which systemctl` を実行して確認してください。**

   ```bash
   which systemctl
   # 例: /bin/systemctl
   sudo visudo -f /etc/sudoers.d/tisly-deploy
   ```

   ```
   tisly ALL=NOPASSWD: /bin/systemctl restart tisly-server, /bin/systemctl status tisly-server
   ```

   `tisly` は `VPS_USER` の実際のユーザー名に置き換えてください。

5. **GitHub Secrets を 4 項目登録**（上表）

6. **手動で 1 回テスト（任意だが推奨）**

   ```bash
   bash /opt/tisly/scripts/deploy-vps.sh
   curl -s https://tisly.jp/api/health | grep commitShort
   ```

7. **このドキュメントを含む変更を push** すると、以降は Actions が自動デプロイします。

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

## 自動デプロイ後に iPhone で見る URL

| 用途 | URL |
|------|-----|
| PWA ハブ | https://tisly.jp/app |
| ヘルス（commit 確認） | https://tisly.jp/api/health |
| 本番トップ | https://tisly.jp/ |

アプリ右下やヘルス JSON の `buildVersion.commitShort` が、GitHub の最新 commit 先頭 7 文字と一致していればデプロイ成功です。

## 次回以降の作業

**智紀さんがやることは Cursor で修正 → Commit & Push（`master`）だけで OK です。**

VPS への SSH、`git pull`、`npm run build`、`systemctl restart` は不要です。

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `.github/workflows/deploy-vps.yml` | GitHub Actions ワークフロー |
| `scripts/deploy-vps.sh` | VPS 上で実行するデプロイスクリプト |
| `.github/workflows/deploy.yml` | CI（release gate）— VPS デプロイは `deploy-vps.yml` を使用 |

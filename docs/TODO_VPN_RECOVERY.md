# VPN / Tailscale 復旧 — 明日の朝一チェックリスト（事務所）

**作成日:** 2026-06-29  
**対象:** ConoHa VPS（tisly.jp）⇔ QNAP TiSLYNAS（Tailscale 経由 WebDAV）

---

## 本日の調査で判明したこと

| 項目 | 状態 |
|------|------|
| VPS Tailscale | `Logged out (invalid key)` — **認証キー失効が原因** |
| TiSLY アプリ本体 | `https://tisly.jp/api/health` は稼働中 |
| QNAP PDF バックアップ | Tailscale 切断のため **WebDAV 到達不可** |
| 事務所 QNAP / PC | ローカル LAN（`192.168.1.10`）は通常どおり利用可 |

**復旧の要点:**  
VPS で Tailscale を再ログインすれば、  
`100.x.x.x` 経由の QNAP WebDAV が復活します。

---

## 使い方（智紀社長向け）

1. 事務所 PC で Cursor を開く
2. 本ファイルをエディタで表示
3. 下の **「コピー用プロンプト」** ブロックをすべてコピー
4. Cursor チャットに貼り付けて送信
5. Cursor が SSH・Tailscale・curl テストを代行します

---

## コピー用プロンプト（Cursor に貼り付け）

```
TiSLY VPN / Tailscale 復旧 — 事務所朝一作業

## 前提（必読）
- docs/autonomous/PROJECT_STATUS.md の QNAP / WebDAV 仕様を守る
- 現調写真と完了報告書写真は混在させない（本件はインフラのみ）
- 秘密情報（auth key・パスワード）は Git にコミットしない
- 本番 .env は VPS の /opt/tisly/server/.env のみ編集

## 背景
- VPS の Tailscale が「Logged out (invalid key)」
- QNAP への WebDAV（Tailscale 100.x 経由）が不通
- tisly.jp 本体は稼働中 — VPN 復旧が主目的

## 確定インフラ値（調査済み）
| 項目 | 値 |
|------|-----|
| VPS アプリパス | /opt/tisly/server |
| VPS SSH ユーザー | tisly（GitHub Actions と同じ） |
| QNAP ローカル IP | 192.168.1.10（事務所 LAN） |
| QNAP Tailscale IP | 100.99.31.120（VPS から到達） |
| WebDAV ベース URL | https://100.99.31.120:5006/TiSLY |
| WebDAV フォールバック | :8080 HTTP / :5001 HTTPS |
| 共有ルート | /TiSLY |
| ヘルス確認 | https://tisly.jp/api/health |

## 実行手順（上から順に・失敗したら報告して停止）

### 0. 事前確認（事務所 PC）
- インターネット接続 OK
- Tailscale Admin Console にログイン可能
  https://login.tailscale.com/admin/machines
- ConoHa VPS へ SSH 可能（鍵 or パスワード）

### 1. VPS に SSH 接続
ssh tisly@<VPS_HOST>
# VPS_HOST は ConoHa パネルの IP

### 2. Tailscale 現状確認
sudo tailscale status
# 期待: 「Logged out」または invalid key 表示
sudo tailscale version

### 3. Tailscale Admin Console で新しい auth key を発行
ブラウザで開く:
https://login.tailscale.com/admin/settings/keys

発行オプション（推奨）:
- Reusable: ON（複数端末で使う場合）
- Ephemeral: OFF（VPS は常駐のため）
- Pre-approved: ON（手動承認を省略）
- Tags: 既存運用に合わせる（未設定でも可）
- Expiration: 90 日以上（再発行忘れ防止）

⚠️ 発行した tskey-auth-... はチャット・Git に貼らない
⚠️ 使い終わったキーは Console で Revoke 可

### 4. VPS で Tailscale 再ログイン
sudo tailscale up --auth-key=tskey-auth-xxxxxxxx
# xxxxxxxx は手順 3 で発行したキー全文

sudo tailscale status
# 期待: 100.x.x.x が割り当てられ online

### 5. QNAP Tailscale 到達確認（VPS 上）
ping -c 3 100.99.31.120
# 不通なら QNAP 側 Tailscale も要確認（事務所 LAN）

### 6. WebDAV 疎通テスト（curl · VPS 上）
# 認証情報は .env から読み取り（画面に出さない）
cd /opt/tisly/server
set -a && source .env && set +a

# PROPFIND — ルート疎通（オレオレ証明書は -k）
curl -sk -u "${QNAP_WEBDAV_USER}:${QNAP_WEBDAV_PASSWORD}" \
  -X PROPFIND \
  -H "Depth: 1" \
  "${QNAP_WEBDAV_URL:-https://100.99.31.120:5006/TiSLY}/" \
  -o /tmp/webdav-propfind.xml -w "HTTP:%{http_code}\n"

# 期待: HTTP:207 または HTTP:200
head -c 500 /tmp/webdav-propfind.xml

# 主 URL 失敗時 — フォールバック試行
curl -sk -u "${QNAP_WEBDAV_USER}:${QNAP_WEBDAV_PASSWORD}" \
  -X PROPFIND -H "Depth: 0" \
  "http://100.99.31.120:8080/TiSLY/" \
  -w "HTTP:%{http_code}\n" -o /dev/null

curl -sk -u "${QNAP_WEBDAV_USER}:${QNAP_WEBDAV_PASSWORD}" \
  -X PROPFIND -H "Depth: 0" \
  "https://100.99.31.120:5001/TiSLY/" \
  -w "HTTP:%{http_code}\n" -o /dev/null

### 7. TiSLY ヘルスチェック
curl -s https://tisly.jp/api/health | python3 -m json.tool | head -80
# 確認項目:
#   ok: true
#   commitShort: 最新 master と一致
#   qnap / storageProvider / qnapConfigured
#   qnapLastError が空または解消

### 8. アプリ API で QNAP 接続確認（任意 · 要ログイン）
# 管理者 JWT 取得後:
# GET https://tisly.jp/api/knowledge/qnap-connection-test
# 期待: reachable: true, mode: "webdav"

# またはブラウザ:
# https://tisly.jp/storage-settings-v1
# →「QNAP接続テスト」ボタン

### 9. QNAP PDF バックアップ Worker 確認（任意）
sudo journalctl -u tisly-server -n 50 --no-pager | grep -i qnap || true
# pending / failed があれば storage-settings で再同期

## 成功条件（すべて満たすこと）
- [ ] `sudo tailscale status` が online
- [ ] VPS から `100.99.31.120` に ping 成功
- [ ] curl PROPFIND が HTTP 200/207
- [ ] `https://tisly.jp/api/health` が ok: true
- [ ] health の qnap 関連エラーが解消

## 失敗時の切り分け
| 症状 | 確認先 | 対処 |
|------|--------|------|
| auth key エラー | Tailscale Console | 新キー再発行 · 期限確認 |
| ping 不通 | QNAP 電源 · LAN · TS Tailscale | 事務所で NAS 起動確認 |
| curl 401/403 | .env の USER/PASS | storage-settings で再設定 |
| curl SSL エラー | QNAP 証明書 | 100.x は自動許容 · -k で再試行 |
| health は OK · WebDAV NG | QNAP_WEBDAV_URL | URL/port を storage-settings と照合 |

## 完了報告フォーマット
1. 各ステップのコマンド出力要約
2. tailscale status の online 確認
3. curl PROPFIND の HTTP コード
4. /api/health の ok と qnap 状態
5. 未解決があれば次に人間がやること

## やらないこと
- master への不要な commit / push
- .env の Git コミット
- Tailscale auth key のリポジトリ保存
```

---

## 手順の補足（人間向けリファレンス）

### Tailscale Admin Console — auth key 発行

1. https://login.tailscale.com/admin/settings/keys を開く
2. **Generate auth key** をクリック
3. オプションを設定（上記プロンプト参照）
4. 表示された `tskey-auth-...` をコピー（一度しか表示されない場合あり）
5. VPS で `sudo tailscale up --auth-key=tskey-auth-...` を実行

### WebDAV curl の見方

| HTTP コード | 意味 |
|-------------|------|
| 207 | PROPFIND 成功（複数ステータス） |
| 200 | 成功 |
| 401 | 認証失敗 — ユーザー/パスワード要確認 |
| 404 | パス不一致 — `/TiSLY` の綴り確認 |
| 000 / timeout | ネットワーク不通 — Tailscale 要再確認 |

### ヘルスチェック URL

| URL | 認証 | 用途 |
|-----|------|------|
| https://tisly.jp/api/health | 不要 | 全体稼働 · commit · QNAP 状態 |
| https://tisly.jp/storage-settings-v1 | 管理者 | UI で接続テスト |
| https://tisly.jp/route-health | 社内 | ルート診断 |

### 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| docs/mothership.md | QNAP 確定インフラ |
| docs/qnap-protocol-comparison.md | WebDAV / Tailscale 前提 |
| docs/autonomous/VPS_AUTO_DEPLOY.md | VPS SSH · デプロイ |
| docs/autonomous/HUMAN_ACTIONS.md | 人間設定一覧 |

---

## 本日の自走タスク — クローズ報告

| # | タスク | 状態 |
|---|--------|------|
| 1 | バックグラウンドタスク整理 | ✅ 完了 |
| 2 | VPS Tailscale 原因特定（invalid key） | ✅ 完了 |
| 3 | 明日朝一チェックリスト作成（本ファイル） | ✅ 完了 |

**次のアクション（人間）:**  
明日事務所到着後、上記プロンプトを Cursor に貼り付けて復旧実行。

# QNAP ネットワーク接続トラブルシュート

VPS（`tisly.jp`）から QNAP WebDAV（Tailscale `100.x` / LAN `192.168.x`）へ届かない場合の確認手順です。  
アプリ側では **保存ルート自動切替**（VPS → ローカル Wi-Fi 直接）と **Ping 診断 API** を用意しています。

関連画面: `/storage-settings-v1`  
関連 API:

- `GET|POST /api/estimate/v1/qnap/ping`
- `GET|POST /api/storage/v1/settings/qnap/ping`
- `POST /api/storage/v1/settings/qnap/test-connection`

---

## 1. VPS 上での導通確認（Tailscale）

SSH で VPS に入り、次を実行します。

```bash
# Tailscale 状態
tailscale status

# WebDAV ポート（例: 100.99.31.10:5006）への疎通
curl -v --max-time 15 http://100.99.31.10:5006/
curl -vk --max-time 15 https://100.99.31.10:5006/

# OPTIONS（認証付き・ユーザー/パスは .env と同じ値）
curl -v --max-time 15 -X OPTIONS \
  -u 'QNAP_USER:QNAP_PASSWORD' \
  'http://100.99.31.10:5006/TiSLY'
```

期待される結果:

| 結果 | 意味 |
|------|------|
| HTTP 200 / 401 / 405 / 207 | ホスト・ポート到達（401 は認証のみ要確認） |
| `Connection refused` | QNAP 側 WebDAV 未起動、またはポート違い |
| `Connection timed out` | Tailscale / ファイアウォール / 経路の問題 |
| `No route to host` | Tailscale 未接続、またはサブネット未広告 |

`tailscale status` で QNAP ノードが **online** か確認してください。offline の場合は QNAP 側 Tailscale / QVPN アプリを再起動します。

---

## 2. QNAP 側の確認

1. **WebDAV サービス**
   - コントロールパネル → アプリケーション → WebDAV（または Web サーバー）
   - HTTP **5006** / HTTPS **5001**（環境により 8080）が有効か
2. **共有フォルダ権限**
   - 共有名（例: `TiSLY`）にアプリ用ユーザーの読み書き権限があるか
3. **QNet / Tailscale / QVPN**
   - Tailscale（または QVPN Client）が接続済みで、VPS から見える `100.x` IP になっているか
4. **ファイアウォール**
   - WebDAV ポートが許可されているか（特に Tailscale インターフェース）

---

## 3. `.env` 推奨設定例

VPS: `/opt/tisly/server/.env`

### A. Tailscale 経由（本番・VPS 保存）

```env
QNAP_WEBDAV_URL=http://100.99.31.10:5006/TiSLY
QNAP_WEBDAV_USER=tisly
QNAP_WEBDAV_PASSWORD=********
QNAP_BASE_DIR=/TiSLY
# 自己署名 HTTPS の場合（必要時）
# QNAP_WEBDAV_TLS_INSECURE=true
# QNAP_WEBDAV_TIMEOUT_MS=30000
```

### B. ローカル LAN 直接用（ブラウザ／事務所 Wi-Fi）

ストレージ設定 UI の IP（例 `192.168.1.10`）に加え、任意で:

```env
# ブラウザ直接保存の優先 URL（未設定時はストレージ設定の host:port を使用）
QNAP_LOCAL_WEBDAV_URL=http://192.168.1.10:8080/TiSLY
```

### C. HTTPS + 自己署名（QNAP 標準 5001）

```env
QNAP_WEBDAV_URL=https://100.99.31.10:5001/TiSLY
QNAP_WEBDAV_TLS_INSECURE=true
QNAP_WEBDAV_USER=tisly
QNAP_WEBDAV_PASSWORD=********
```

### 組み合わせの目安

| 経路 | URL 例 | 用途 |
|------|--------|------|
| VPS → Tailscale | `http://100.x.x.x:5006/TiSLY` | 外出先・常時バックアップ |
| 端末 → LAN | `http://192.168.x.x:8080/TiSLY` | 事務所同一 Wi-Fi の直接保存 |
| DDNS / グローバル | `https://nas.example.com:5001/TiSLY` | 公開可能な場合のみ（推奨度は低） |

---

## 4. アプリ側の保存ルート

`/storage-settings-v1` の **QNAP保存ルート**:

| 値 | 動作 |
|----|------|
| **自動** | まず VPS→QNAP。502 / タイムアウト時にブラウザ→LAN 直接へフォールバック |
| **VPS経由のみ** | Tailscale / `.env` のみ（フォールバックなし） |
| **ローカルWi-Fi経由** | ブラウザから LAN IP へ直接 PUT |

診断ボタン:

- **Ping診断** … VPS から `.env` の `QNAP_WEBDAV_URL` へ Reachability（ms・エラーコード・ログ）
- **ローカルWi-Fi診断** … いま開いている端末から LAN IP へ OPTIONS

エラーコードの例: `ECONNREFUSED` / `ETIMEDOUT` / `401 Unauthorized` / `EHOSTUNREACH` / `CORS` / `MIXED_CONTENT`

---

## 5. よくある失敗パターン

1. **VPS から Tailscale タイムアウト**  
   → QNAP Tailscale 再起動、`tailscale status`、ポート 5006 確認。事務所では **自動** または **ローカルWi-Fi** を使う。
2. **HTTPS ページから HTTP LAN へ保存できない（Mixed Content）**  
   → QNAP で HTTPS WebDAV（5001）を使う、または信頼できる証明書を設定。
3. **ブラウザ CORS で PUT 拒否**  
   → QNAP / リバースプロキシで CORS 許可、または VPS 経由に戻す。
4. **401**  
   → ユーザー名・パスワード・共有 ACL を確認。

---

## 6. デプロイ後の確認

1. `https://tisly.jp/api/health` の `commitShort` が最新コミットと一致
2. 管理者で `/storage-settings-v1` → **Ping診断**
3. 見積一覧の QNAP 保存（事務所 Wi-Fi でフォールバック動作を確認）

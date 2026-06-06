# nginx 本番構成 — tisly.jp（Phase 1381–1400）

TiSLY Platform を **https://tisly.jp** で公開するための nginx 設定ガイドです。  
テンプレート本体: [`server/deploy/nginx/tisly.jp.conf`](../server/deploy/nginx/tisly.jp.conf)

## 構成概要

```
インターネット
    │ HTTPS :443
    ▼
nginx (tisly.jp)
    │ proxy_pass → 127.0.0.1:3080
    ▼
Node.js (Express) — PWA + REST + WebSocket
```

- 公開 URL は **https://tisly.jp** / **wss://tisly.jp** のみ
- Node.js は VPS 内部 `127.0.0.1:3080` で待受（外部から直接アクセスしない）
- PWA の深いリンク（例 `/customer/TOMS001/install/home`）は Express が HTML を返すため、nginx 側 `try_files` は不要

## ルート一覧

| パス | 用途 | 備考 |
|------|------|------|
| `/app` | App Hub | PWA 入口 |
| `/survey` | 現調 PWA | |
| `/business` | TOMS Business PWA | 専用 SW `/sw-business.js` |
| `/sales` | 営業デモ | |
| `/customer/` | 顧客ポータル・施工・PRO Remote | 動的 manifest 含む |
| `/tv/` | Google TV Web | |
| `/deployment/` | 導入チェックリスト | |
| `/api/` | REST API | |
| `/ws` | WebSocket | PRO Remote / TV / 営業 |
| `/service-worker.js` | 共通 Service Worker | `Cache-Control: no-cache` |
| `/sw-business.js` | Business 専用 SW | scope `/business` |
| `/manifest*.webmanifest` | PWA manifest | 静的 + 動的 |
| `/icons/` | PWA アイコン | 7 日キャッシュ |
| `/health` | ヘルスチェック | |
| `/` | フォールバック | その他すべて Node へ |

## PWA fallback

すべての HTML / PWA ルートは **同一 upstream**（`tisly_backend`）へプロキシします。

```nginx
upstream tisly_backend {
    server 127.0.0.1:3080;
    keepalive 32;
}
```

深い URL のリロード 404 を防ぐため、`/customer/` `/deployment/` 等は prefix マッチで Node へ渡します。

## gzip

本番テンプレートでは以下を有効化しています。

- `gzip on` / `gzip_vary on`
- `gzip_types` — CSS, JS, JSON, manifest, SVG
- API レスポンスと静的アセットの転送量削減

## SSL（HTTPS）

```nginx
server {
    listen 443 ssl http2;
    server_name tisly.jp www.tisly.jp;
    ssl_certificate     /etc/letsencrypt/live/tisly.jp/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tisly.jp/privkey.pem;
    ...
}
```

HTTP (:80) は HTTPS へ 301 リダイレクトします。証明書は **certbot** で取得（手順は [`tisly_vps_deploy_step_by_step.md`](./tisly_vps_deploy_step_by_step.md)）。

## WebSocket

```nginx
location /ws {
    proxy_pass http://tisly_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
}
```

クライアント側は `wss://tisly.jp/ws`（`location.host` 相対）を使用。`ws://` ハードコードは禁止。

## インストール（コピペ）

```bash
sudo cp /opt/tisly/server/deploy/nginx/tisly.jp.conf /etc/nginx/sites-available/tisly.jp
sudo ln -sf /etc/nginx/sites-available/tisly.jp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 確認コマンド

```bash
curl -sI https://tisly.jp/health
curl -sI https://tisly.jp/app
curl -sI https://tisly.jp/manifest.webmanifest
curl -sI https://tisly.jp/service-worker.js
```

WebSocket はブラウザまたは `wscat -c wss://tisly.jp/ws` で確認。

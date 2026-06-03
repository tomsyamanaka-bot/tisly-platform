# 顧客別サブドメイン戦略（Phase 261–280 更新）

## 目的

PRO Remote 顧客ごとに分離された URL と WAF ルールを提供し、`customer_code` をホスト名から解決する。

## URL 例

| 顧客 | ポータル | TV | 管理 |
|------|----------|-----|------|
| TOMS001 | `https://toms001.tisly.jp/customer/TOMS001` | `/tv/TOMS001` | `/admin/TOMS001` |
| HOTEL001 | `https://hotel001.tisly.jp/...` | 同上 | 同上 |
| PLANT001 | `https://plant001.tisly.jp/...` | 同上 | 同上 |

パス形式は既存 `/customer/:code` を維持。サブドメインはテナント解決用。

## nginx 設計（抜粋）

```nginx
map $host $tisly_customer_code {
  default "";
  ~^(?<code>[a-z0-9]+)\.tisly\.jp$ $code;
}

server {
  listen 443 ssl http2;
  server_name *.tisly.jp tisly.jp;
  # ssl_certificate — 将来 *.tisly.jp ワイルドカード
  location / {
    proxy_pass http://127.0.0.1:3080;
    proxy_set_header Host $host;
    proxy_set_header X-TiSLY-Customer-Code $tisly_customer_code;
  }
}
```

アプリ側: `X-TiSLY-Customer-Code` と JWT `customerCode` の一致を検証（`tenant-guard`）。

## テナント code 解決

実装: `server/src/customer/subdomain-resolver.ts`

| ホスト | 解決コード |
|--------|------------|
| `toms001.tisly.jp` | TOMS001 |
| `hotel001.tisly.jp` | HOTEL001 |
| `plant001.tisly.jp` | PLANT001 |

ローカル開発: `X-TiSLY-Customer-Code` ヘッダまたは `?customerCode=TOMS001`

1. サブドメイン → `customer_code`（大文字化）
2. JWT `scope=customer` → `customerId` 固定
3. API パス `:customerCode` → `canAccessCustomer`

nginx テンプレート: `server/deploy/nginx/customer-subdomains.conf`

## WAF / SSL

- レート制限: `/api/auth/customer/login`
- Geo 制限（任意）
- TLS 1.2+、HSTS
- 将来: Let's Encrypt DNS-01 で `*.tisly.jp` ワイルドカード

## 顧客別 URL ルール

- PRO_REMOTE のみ顧客ポータル・TV Web を公開
- Standard/Lite はサブドメインで 403 またはリダイレクト案内

# WAF / nginx Security Snippets — Phase 181-200

VPS 本番投入時の **nginx セキュリティ設定方針** です。

## スニペット

`server/deploy/nginx/security-snippets.conf` を `include` してください。

## 内容概要

| 対策 | 方針 |
|------|------|
| Rate limit | `limit_req_zone` — 一般 API / ingest / admin 別ゾーン |
| Admin path | `/api/auth`, `/api/security`, `/operations` — 厳しめ制限 + IP 許可リスト推奨 |
| Upload 制限 | `client_max_body_size 1m`（ingest JSON のみ想定） |
| Path traversal | `location ~ /\.` deny; `..` 正規化 |
| SQL injection | アプリ層は prepared statement — WAF は ModSecurity CRS 検討 |
| Bot 対策 | `User-Agent` 空拒否、既知スキャナ block |
| HSTS | `Strict-Transport-Security: max-age=31536000; includeSubDomains` |
| Security headers | X-Frame-Options, X-Content-Type-Options, CSP baseline |

## TLS 終端

nginx で HTTPS 終端 → Node.js は localhost:3080 プロキシ。

## MQTT

Mosquitto は nginx 経由せず **8883 TLS 直接** — `docs/mqtt_security_acl_tls.md` 参照。

## 関連

- `docs/tls_ocsp_pinning.md`
- `docs/production_security_checklist.md`

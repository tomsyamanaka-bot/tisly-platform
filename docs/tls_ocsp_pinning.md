# TLS / OCSP / Certificate Pinning — Phase 181-200

## HTTPS 必須

- 公開 API / PWA / Operations UI は **HTTPS のみ**
- HTTP → 301 リダイレクト
- Let's Encrypt（certbot）推奨

## MQTT TLS 8883

- 平文 1883 は開発 LAN のみ
- 本番: Mosquitto TLS 8883 + クライアント証明書 or ユーザー/パスワード
- 参照: `docs/mqtt_security_acl_tls.md`

## OCSP Stapling

nginx 例:

```nginx
ssl_stapling on;
ssl_stapling_verify on;
ssl_trusted_certificate /etc/letsencrypt/live/tisly.jp/chain.pem;
resolver 8.8.8.8 valid=300s;
```

## HSTS

`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`  
初回デプロイ後、preload リスト登録は慎重に（ロールバック困難）。

## 証明書更新

- certbot timer（90 日周期）
- 更新後 `nginx -s reload`
- Mosquitto cert 同期スクリプト

## TV アプリ Pinning 検討

- Google TV / Android: Network Security Config で CA ピン
- 証明書ローテーション時は **アプリ更新** が必要
- PoC ではシステム CA 信頼、本番で pinning 評価

## 証明書失効時

1. 新 cert 発行・デプロイ
2. 旧 cert 失効（Let's Encrypt revoke）
3. TV pinning 利用時はアプリ側 pin 更新
4. 監視: SSL Labs / uptime SSL expiry alert

## 関連

- `server/deploy/nginx/security-snippets.conf`
- `docs/waf_rules.md`

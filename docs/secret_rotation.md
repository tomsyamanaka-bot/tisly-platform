# Secret ローテーション手順（Phase 161–180）

## Device Secret

1. 管理画面でログイン（JWT）
2. `POST /api/devices/:deviceId/rotate-secret`（要 Bearer トークン）
3. レスポンスの `secret` を **一度だけ** 安全な経路でデバイスへ配布
4. Node-RED / ESP32 / RP2350 の設定を更新
5. 旧 secret は即時無効（DB の `secret_hash` が更新される）

## INGEST_SECRET（Node-RED → Server）

1. `POST /api/security/rotate-ingest-secret`（要管理者認証）
2. 返却された `ingestSecret` を Node-RED 環境変数 `INGEST_SECRET` に設定
3. `server/.env` の `INGEST_SECRET` も同値に更新しサーバー再起動
4. **debug ノードに secret を出力しない**

## MQTT パスワード

1. `mosquitto_passwd` で該当ユーザーを更新
2. `docs/mqtt_security_acl_tls.md` の ACL を確認
3. デバイス `mqtt.json` を OTA または現場 USB で更新

## TV ペアリング無効化

- `POST /api/tv/devices/:id/revoke` — ペアリングコード・サイト紐付けを解除し `status=revoked`
- 監査ログに `tv.revoke` が記録される

## 漏洩時チェックリスト

- [ ] Device secret ローテーション
- [ ] INGEST_SECRET ローテーション
- [ ] MQTT ユーザー削除 / 再発行
- [ ] JWT_SECRET 変更（全管理者再ログイン）
- [ ] 監査ログで不正アクセス有無を確認

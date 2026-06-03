# Google TV Security — TiSLY Phase 219-220

## ペアリング強化

- 6 桁ペアリングコード（10 分 TTL）
- IP 単位の試行回数制限（`tv_pairing_attempts`）
- Redis キャッシュ `tv:pairing:{code}` でコード整合性検証（`RATE_LIMIT_PROVIDER=redis` 時）

## デバイス証明書（プレースホルダ）

| フィールド | 説明 |
|------------|------|
| `device_certificate_placeholder` | 実機証明書 PEM の保存先（Phase 221+ で実装） |
| `certificate_fingerprint` | SHA-256 フィンガープリント（ペアリング confirm 時に登録） |

### API

`POST /api/tv/pairing/confirm` ボディ:

```json
{
  "pairingCode": "123456",
  "site_id": "site-001",
  "certificateFingerprint": "AB:CD:...",
  "deviceCertificate": "-----BEGIN CERTIFICATE-----..."
}
```

## Certificate Pinning

本番では `TV_CERT_PINNING_ENABLED=true` とし、登録済みフィンガープリントと一致しない TV 接続を拒否します（Phase 221+ でミドルウェア実装）。

詳細: [tls_ocsp_pinning.md](./tls_ocsp_pinning.md)

## 運用チェックリスト

1. TV アプリからペアリングコード取得
2. 管理画面 `/operations` → TV タブで状態確認
3. Infrastructure タブで TV が GREEN であることを確認
4. 無効化は `POST /api/tv/devices/:id/revoke`（要管理者認証）

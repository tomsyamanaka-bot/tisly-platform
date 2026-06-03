# デバイス証明書パイプライン（Phase 381–400）

## API（顧客スコープ · installer ロール）

| メソッド | パス | 説明 |
|----------|------|------|
| POST | `/api/customer/:code/devices/:id/csr` | CSR 登録 |
| POST | `/api/customer/:code/devices/:id/cert/issue` | 自己署名 placeholder 発行 |
| POST | `/api/customer/:code/devices/:id/cert/revoke` | 失効 |
| GET | `/api/customer/:code/devices/:id/cert/status` | 状態（viewer 可） |

## 実装

- `server/src/provisioning/device-csr.ts`
- 証明書本体: `device-certificates.ts` placeholder PEM
- メタ: `devices.metadata_json.csr`

## 本番移行

1. 実 CA / ACME 連携で `cert/issue` を差し替え
2. MQTT mTLS ブローカー ACL と fingerprint 連携
3. 詳細: `docs/device_mtls_provisioning.md`

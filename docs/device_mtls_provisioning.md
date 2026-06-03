# デバイス mTLS 証明書プロビジョニング設計（placeholder）

## コンポーネント

| 要素 | 説明 |
|------|------|
| Device certificate | 端末クライアント証明書 |
| CSR | 現場または工場で生成 |
| CA | TiSLY テナント CA（将来） |
| Rotation | `last_cert_rotated_at` |
| Revocation | `cert_status = revoked` |
| MQTT TLS | ポート **8883** |

## デバイス列（`devices`）

- `cert_status`: `none` \| `provisioned` \| `trusted` \| `expired` \| `revoked`
- `cert_fingerprint`
- `trust_level`: `none` \| `bootstrap` \| `provisioned` \| `trusted`
- `last_cert_rotated_at`

## コード（placeholder）

- `server/src/provisioning/device-certificates.ts`
- `GET .../devices/:id/cert-placeholder` — デモ用発行

## ESP32 / RP2350 方針

1. 初回: QR/NFC claim → bootstrap トークン
2. 工場/現場: CSR 送信 → 署名証明書フラッシュ
3. 運用: MQTT over TLS 8883、フィンガープリント照合
4. 失効: 管理画面から revoke → ブローカー ACL 更新（将来）

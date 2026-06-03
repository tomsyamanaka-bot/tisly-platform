# HMAC Event Signature — Phase 181-200

デバイスから TiSLY へのイベント ingest に **改ざん検知・時刻検証** を追加する仕様です。

## ヘッダー

| ヘッダー | 説明 |
|----------|------|
| `x-tisly-device-id` | デバイス ID |
| `x-tisly-timestamp` | Unix 秒（文字列） |
| `x-tisly-signature` | HMAC-SHA256 署名（hex） |

移行期間は `x-tisly-device-secret` も併用可能（サーバーが secret を解決）。

## 署名計算

```
message = timestamp + "." + raw_body
signature = HMAC-SHA256(device_secret, message)  // hex 出力
```

- `raw_body` は HTTP ボディの生 JSON 文字列（空白・キー順序含む）
- `device_secret` はプロビジョニング時に発行された平文 secret

## 検証ルール

1. timestamp が現在時刻から **5 分（`SIGNATURE_MAX_AGE_SEC`）** 以内
2. 署名が一致（タイミングセーフ比較）
3. 失敗時 **401 Unauthorized**
4. `SIGNATURE_CHECK_ENABLED=true` の場合、署名ヘッダー必須

## Node-RED / デバイス実装例

```javascript
const crypto = require("crypto");
const timestamp = Math.floor(Date.now() / 1000).toString();
const rawBody = JSON.stringify(payload);
const sig = crypto
  .createHmac("sha256", DEVICE_SECRET)
  .update(`${timestamp}.${rawBody}`)
  .digest("hex");

// POST /api/events/ingest
// Headers: x-tisly-device-id, x-tisly-timestamp, x-tisly-signature
```

## サーバー実装

- `server/src/security/event-signature.ts`
- `device_credentials.secret_encrypted` — HMAC 検証用（AES-GCM、JWT_SECRET 派生キー）

## 関連

- Replay 対策: `server/src/security/replay-protection.ts`
- ドキュメント: `docs/event_signature.md`（本ファイル）

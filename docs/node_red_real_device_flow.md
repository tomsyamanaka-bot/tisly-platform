# Node-RED 実機 ingest フロー（Phase 161–180 更新）

## フロー

`node-red/tisly_real_device_ingest_v1.json`

```
MQTT tisly/+/+/+/#
  → Route (event/recovery/heartbeat/state)
  → Unified event 変換（device_id 必須）
  → POST /api/events/ingest
       Headers:
         x-tisly-ingest-secret: <INGEST_SECRET>
         （または x-tisly-device-id + x-tisly-device-secret）
  → retry (max 3, exponential backoff)
```

## 環境変数（必須）

| 変数 | 例 | 注意 |
|------|-----|------|
| `INGEST_SECRET` | server `.env` と **完全一致** | debug に出力しない |
| `TISLY_INGEST_URL` | `https://tisly.jp` | 本番は HTTPS |

## device_id 付与

- MQTT トピック `tisly/{tenant}/{site}/{device_id}/event` から `device_id` を抽出
- HTTP payload の `device_id` と一致させる
- プロビジョニング QR の `deviceId` を現場で固定する

## retry 時の注意

- 429 / 503 は backoff を長めに（レート制限・メンテ）
- 401 は **secret 不一致** — リトライしても成功しない。アラートを出しローテーション手順へ
- 同一 `event_id` の重複 POST はサーバー側で冪等化を検討（TODO Phase 181+）

## セキュリティ

- **本番では debug ノードを無効化**（Deploy から削除または adminOnly）
- Function ノードの `node.warn(msg.secret)` 等を禁止
- `INGEST_SECRET` は Node-RED Credentials または OS 環境変数のみ

## デバイス secret 併用（ゲートウェイ直 POST 時）

```
x-tisly-device-id: SITE-gateway-a1b2c3d4
x-tisly-device-secret: <provision時の平文1回のみ>
```

## heartbeat

- `POST /api/devices/{deviceId}/heartbeat` — ingest secret または device secret 推奨（今後 middleware 拡張）

## 参照

- `docs/secret_rotation.md`
- `docs/rc1_security_checklist.md`

# Node-RED HTTP Ingest 設計

MQTT で受けたイベントを **TiSLY server** に HTTP POST する経路です。  
MQTT は VPS 内部のみ。外部デバイス → Mosquitto → Node-RED → **HTTP ingest** → server。

## エンドポイント

```
POST https://tisly.jp/api/events/ingest
```

| ヘッダ | 値 |
|--------|-----|
| `Content-Type` | `application/json` |
| `X-TiSLY-Ingest-Secret` | `.env` の `INGEST_SECRET`（共有秘密） |

## ペイロード（統一形式）

`docs/unified_event_format.md` に準拠。最小例:

```json
{
  "event_id": "evt-20250603-001",
  "tenant_id": "default",
  "site_id": "tsuchiura",
  "device_id": "plc-main-01",
  "source_type": "plc",
  "event_type": "perimeter",
  "severity": "alarm",
  "zone": "beam-1",
  "message": "外周検知",
  "payload": { "raw": "..." },
  "created_at": "2025-06-03T12:00:00+09:00"
}
```

## Node-RED function ノード例

```javascript
const evt = {
  event_id: msg.payload.event_id || ("nr-" + Date.now()),
  tenant_id: env.get("TENANT_ID") || "default",
  site_id: msg.payload.site_id || "default",
  device_id: msg.payload.device_id || msg.topic.split("/")[2],
  source_type: "node-red",
  event_type: msg.payload.event_type || "event",
  severity: msg.payload.severity || "info",
  zone: msg.payload.zone || "",
  message: msg.payload.message || msg.payload.title || "Node-RED event",
  payload: msg.payload,
  created_at: new Date().toISOString()
};

msg.headers = {
  "Content-Type": "application/json",
  "X-TiSLY-Ingest-Secret": env.get("INGEST_SECRET")
};
msg.payload = evt;
msg.url = "https://tisly.jp/api/events/ingest";
return msg;
```

直後に **http request** ノード（POST）。

## debug 確認手順

1. Node-RED で inject → function → http request
2. server ログで ingest 受信を確認
3. `GET /api/events?limit=5` で DB 反映
4. 通知が必要な severity なら PWA / Discord / Email を確認

## 再 publish 方針

| ケース | 方針 |
|--------|------|
| ingest 成功（201） | Node-RED 側で完了。MQTT 再送不要 |
| 5xx / タイムアウト | 指数バックオフでリトライ（最大 3 回推奨） |
| 401/403 | 秘密不一致 — 再送しない。設定修正 |
| 重複 `event_id` | server は idempotent 更新（同一 id は UPSERT） |

重大イベントは Node-RED 内でデッドレターキュー（ファイル or MQTT `tisly/deadletter`）に退避する設計を推奨（将来 TODO）。

## 環境変数（Node-RED）

Global Environment:

- `INGEST_SECRET` — server `.env` と同一
- `TENANT_ID` — 既定テナント

server 側: `INGEST_SECRET` を `.env` に設定。未設定時は ingest は 503 を返す。

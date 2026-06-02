# 統一イベント形式（Unified Event Format）

ESP32 / RP2350 / PLC / Node-RED / system / tv-app から server に届くイベントの共通スキーマです。

## 必須フィールド

| フィールド | 型 | 説明 |
|------------|-----|------|
| `event_id` | string | 一意 ID（再送・重複排除用） |
| `tenant_id` | string | テナント（多拠点将来用） |
| `site_id` | string | 拠点 ID |
| `device_id` | string | デバイス識別子 |
| `source_type` | enum | 発生源種別（下表） |
| `event_type` | string | 論理イベント種別（`perimeter`, `heartbeat` 等） |
| `severity` | enum | 重要度（下表） |
| `zone` | string | ゾーン・エリア（空可） |
| `message` | string | 人間可読メッセージ |
| `payload` | object | 機器固有の追加データ |
| `created_at` | string | ISO 8601 タイムスタンプ |

## source_type

| 値 | 説明 |
|----|------|
| `esp32` | ESP 版ファームウェア |
| `rp2350` | RP2350 版 |
| `plc` | PLC / GX 連携 |
| `node-red` | Node-RED フロー |
| `system` | プラットフォーム内部（ハートビート監視等） |
| `tv-app` | Google TV アプリ |

## severity

| 値 | 通知 | TV オーバーレイ |
|----|------|-----------------|
| `info` | 通常オフ | なし |
| `warning` | 設定次第 | 短時間表示可 |
| `alarm` | 有効 | 全画面・10秒 |
| `critical` | 有効 | **解除まで表示（TODO）** |

## JSON 例

```json
{
  "event_id": "evt-plc-20250603-120001",
  "tenant_id": "default",
  "site_id": "carshop-night",
  "device_id": "plc-fx-01",
  "source_type": "plc",
  "event_type": "intrusion",
  "severity": "alarm",
  "zone": "beam-sensor-2",
  "message": "近接検知 — 警戒中",
  "payload": {
    "x_input": "X3",
    "y_outputs": ["Y3", "Y4"]
  },
  "created_at": "2025-06-03T12:00:01+09:00"
}
```

## 後方互換

既存 MQTT / `POST /api/events` は `deviceId`, `eventType`, `title` を引き続き受け付けます。  
server は内部で統一形式に正規化して `events` テーブルへ保存します。

## PostgreSQL 移行 TODO

SQLite の `events` テーブルは将来 PostgreSQL へ移行予定。  
`tenant_id`, `site_id`, `source_type` 列は移行時のパーティションキー候補。

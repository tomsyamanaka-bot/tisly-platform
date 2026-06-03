# SIEM Log Format — Phase 181-200

TiSLY セキュリティイベントの **SIEM エクスポート形式** です。

## 出力先

- ローカル: `data/siem/siem-YYYY-MM-DD.ndjson`（1 行 1 JSON）
- 将来: Wazuh / Grafana Loki / Elastic / QNAP syslog

## フィールド

| フィールド | 型 | 説明 |
|------------|-----|------|
| `timestamp` | ISO8601 | イベント時刻 |
| `tenant_id` | string \| null | テナント |
| `site_id` | string \| null | サイト |
| `user_id` | string \| null | ユーザー（admin 操作時） |
| `action` | string | 例: `ingest.accepted`, `auth.login`, `ingest.duplicate` |
| `severity` | `info` \| `warning` \| `high` \| `critical` | 重要度 |
| `source_ip` | string \| null | 送信元 IP |
| `device_id` | string \| null | デバイス |
| `event_id` | string \| null | イベント ID |
| `message` | string | 人間可読メッセージ |

## 例

```json
{"timestamp":"2026-06-03T12:00:00.000Z","tenant_id":"default","site_id":"site-1","user_id":null,"action":"ingest.accepted","severity":"info","source_ip":"127.0.0.1","device_id":"gw-001","event_id":"evt-abc","message":"motion detected"}
```

## 設定

- `SIEM_EXPORT_ENABLED=true`（デフォルト true）

## 実装

- `server/src/security/siem-exporter.ts`

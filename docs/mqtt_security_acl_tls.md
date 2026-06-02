# MQTT セキュリティ — ACL / TLS 設計（Phase 161–180 強化）

## 原則

| 項目 | 方針 |
|------|------|
| 配置 | MQTT ブローカー（Mosquitto）は **VPS 内部** を原則とする |
| 外部公開 | やむを得ない場合は **TLS 必須**（8883 / 443 終端） |
| 認証 | デバイスごとに **専用ユーザー名 + パスワード** |
| ACL | **device_id 単位** で publish / subscribe を分離 |

## トピック ACL 例

```
# デバイス ESP-GATE-001（tenant=default, site=moriya-home）
user esp-gate-001
topic read  tisly/default/moriya-home/ESP-GATE-001/state
topic write tisly/default/moriya-home/ESP-GATE-001/event
topic write tisly/default/moriya-home/ESP-GATE-001/heartbeat
topic read  tisly/default/moriya-home/ESP-GATE-001/cmd
topic write tisly/default/moriya-home/ESP-GATE-001/recovery

# サーバー subscriber（全 tenant 読み取り）
user tisly-server
topic read tisly/+/+/+/event
topic read tisly/+/+/+/heartbeat
topic read tisly/+/+/+/recovery
topic read tisly/+/+/+/state
topic write tisly/+/+/+/cmd
```

## TLS / 証明書

- 本番: Let's Encrypt または社内 CA
- デバイス: 必要に応じて **クライアント証明書**（高セキュリティ拠点）
- ローテーション: 90 日ごと、漏洩時は即時失効

## デプロイ用サンプル（リポジトリ内）

| ファイル | 説明 |
|----------|------|
| `server/deploy/mosquitto/mosquitto.conf.example` | listener 1883 (localhost) + 8883 TLS |
| `server/deploy/mosquitto/aclfile.example` | per-device ACL |
| `server/deploy/mosquitto/passwordfile.README.md` | `mosquitto_passwd` 手順 |

## Mosquitto 設定例（抜粋）

```conf
listener 1883 127.0.0.1
allow_anonymous false
password_file /etc/mosquitto/passwd
acl_file /etc/mosquitto/acl

listener 8883 0.0.0.0
cafile /etc/mosquitto/certs/ca.crt
certfile /etc/mosquitto/certs/server.crt
keyfile /etc/mosquitto/certs/server.key
require_certificate false
password_file /etc/mosquitto/passwd
acl_file /etc/mosquitto/acl
```

## TiSLY Server 連携

- `MQTT_USERNAME` / `MQTT_PASSWORD` — `tisly-server` ユーザー推奨
- Subscriber は read-only ACL で event/heartbeat を購読
- cmd トピックへの write はサーバーのみ

## 漏洩時

1. 該当 `device_id` の MQTT ユーザーを passwd から削除
2. ACL を再生成・reload
3. デバイス側 `mqtt.json` を新パスワードで再フラッシュ
4. `docs/secret_rotation.md` の手順に従い INGEST_SECRET / device secret もローテーション

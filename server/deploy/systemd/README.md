# systemd ユニット（本番テンプレート）

配置先: `/etc/systemd/system/`  
アプリルート: `/opt/tisly`（変更時は各 `.service` の `WorkingDirectory` / `ExecStart` を合わせる）

## インストール

```bash
sudo cp tisly-server.service tisly-notification-worker.service tisly-node-red.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tisly-server tisly-node-red
sudo systemctl start tisly-server
```

## サービス一覧

| ユニット | 説明 |
|----------|------|
| `tisly-server.service` | Express API + PWA 静的 + WebSocket |
| `tisly-notification-worker.service` | 将来: キュー専用ワーカー（現状は server に統合） |
| `tisly-node-red.service` | Node-RED（MQTT → HTTP ingest） |

`tisly-notification-worker` は Phase 41–60 では **オプション**です。  
通知処理は `tisly-server` 内の `notification-service` が担当します。  
キュー分離時に worker を有効化してください。

## ログ

```bash
journalctl -u tisly-server -f
journalctl -u tisly-node-red -f
```

## ユーザー

`tisly-server.service` は **User/Group 未指定**（root 起動の VPS 向け）。  
`systemctl` を root で実行するとプロセスも root で動作します。

専用ユーザーで運用する場合のみ `User=tisly` / `Group=tisly` を追加し、初回:

```bash
sudo useradd -r -s /usr/sbin/nologin tisly
sudo chown -R tisly:tisly /opt/tisly
```

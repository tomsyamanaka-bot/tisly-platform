# Node-RED — TiSLY Home Security v1

## 必要パッケージ

```bash
npm install -g --unsafe-perm node-red
cd ~/.node-red
npm install node-red-dashboard
```

## インポート

1. Node-RED 起動: `node-red`
2. メニュー → Import → `tisly_home_v1.json`
3. **MQTT ブローカー** ノードを開き、ブローカー IP を設定
4. Deploy
5. ダッシュボード: `http://<host>:1880/ui`

## フロー構成

| # | 機能 |
|---|------|
| 1 | MQTT 購読 → Dashboard 表示（DI / Relay） |
| 2 | イベントログ保存（`/data/tisly_events.log`） |
| 3 | 通知フロー雛形（debug + コメント。LINE/メールは接続先を追記） |
| 4 | Heartbeat 監視（90秒無応答で警告） |
| 5 | アラーム監視（`tisly/home/alarm`） |

## MQTT

- 購読: `tisly/home/#`
- ブローカーポート: 1883（デフォルト）

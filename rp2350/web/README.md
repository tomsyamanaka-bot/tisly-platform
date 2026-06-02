# TiSLY UI v1

スマホ優先の静的 Web UI（MQTT over WebSocket）。

## 起動

任意の静的サーバーで `web/` を配信:

```bash
cd rp2350/web
python -m http.server 8080
```

ブラウザ: `http://localhost:8080/#home`

## ページ

| ハッシュ | 内容 |
|--------|------|
| `#home` | 総合状態・大きなステータス |
| `#sensors` | DI/RO カード一覧 |
| `#events` | MQTT イベント履歴 |
| `#settings` | WebSocket URL |
| `#about` | 製品情報 |

## 色

- 緑: 正常
- 黄: 注意（通信遅延・検知あり）
- 赤: 異常・アラーム

## 依存

- CDN: mqtt.js 5.x
- Mosquitto WebSocket（`9001` 等）

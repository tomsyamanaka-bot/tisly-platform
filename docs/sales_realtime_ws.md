# 営業画面 WebSocket リアルタイム（Phase943）

## 接続

- エンドポイント: `ws://{host}/ws`
- 購読: `{ "type": "subscribe", "channel": "sales" }`

## イベント

トピック `sales/demo` — 通知・侵入・復旧・保守・ROI・device_mode・reset

## フロント

- `server/public/js/sales-realtime.js`
- WS 不可時は 20 秒 polling（`/api/demo-kit/status`）
- 上部バッジ: **Live** / **Mock** / **Offline**

## 確認 URL

http://localhost:3080/sales

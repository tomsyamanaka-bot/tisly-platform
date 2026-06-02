# PWA 実機デモ手順（Phase 101–120）

## 前提

- server 起動: `npm run dev` または `npm run demo`
- iPhone と PC が同一 LAN（または HTTPS 本番）

---

## 1. iPhone で PWA 追加

1. Safari で `http://<PC-IP>:3080/` を開く
2. 共有 → **ホーム画面に追加**
3. アイコンから起動（スタンドアロン）

---

## 2. Push 許可

1. 設定画面 `/settings` で Web Push を有効化
2. VAPID キー未設定時は UI に「デモ: Push 無効」と表示 — `.env` に `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` を設定後再起動
3. ブラウザの通知許可を **許可**

---

## 3. デモイベント送信（実機なし）

```bash
curl -X POST http://localhost:3080/api/test/alarm \
  -H "Content-Type: application/json" \
  -d '{"message":"PWAデモ警報","deviceId":"ESP-HOME-001"}'
```

または運用コンソール `/operations` → デモトリガー。

---

## 4. 実機イベント受信

1. デバイスを MQTT → Node-RED → ingest 経路で接続
2. `device_id` を PWA 登録ユーザーと紐付け（将来。現状は全警報を配信）
3. センサー作動で `.../event` が飛ぶことを `mosquitto_sub` で確認

---

## 5. 通知確認

- [ ] ロック画面にプッシュ（VAPID 有効時）
- [ ] `/notifications` 一覧にイベント
- [ ] severity `alarm` は強調表示

---

## 6. 既読確認

1. 通知一覧でイベントをタップ
2. 既読状態が UI に反映（実装済み API: notifications ルート）

---

## 7. 異常時の切り分け

| 症状 | 確認 |
|------|------|
| PWA 追加できない | HTTPS / LAN IP、証明書 |
| Push 来ない | VAPID、Service Worker `/service-worker.js`、許可状態 |
| イベントは DB にあるが Push なし | `settings` の push enabled、subscription 登録 |
| 実機のみダメ | MQTT → Node-RED debug → ingest 403（INGEST_SECRET） |
| TV だけダメ | WS `ws://<IP>:3080/ws`、ファイアウォール |

テスト API 一覧: `GET /api/test/help`

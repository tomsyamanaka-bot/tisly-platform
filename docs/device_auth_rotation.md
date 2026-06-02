# デバイス認証・シークレットローテーション（Phase 121–140）

## 対象シークレット

| 種別 | 用途 | 保存場所 |
|------|------|----------|
| device secret | デバイス個別 API（将来） | デバイス flash / metadata |
| INGEST_SECRET | Node-RED → HTTP ingest | server `.env` |
| MQTT password | ブローカー認証 | デバイス `mqtt.json` / Mosquitto passwd |
| TV pairing code | 10 分・使い捨て | `tv_devices` DB |
| Discord webhook | 通知 | `.env` / platform_settings |
| VAPID | Web Push | `.env` |

## ローテーション手順（INGEST_SECRET 例）

1. 新シークレットを生成（32 文字以上）
2. server `.env` を更新 → `systemctl restart tisly`
3. Node-RED 環境変数 `INGEST_SECRET` を更新 → Deploy
4. 旧シークレットを 24 時間後に無効化（ログで旧ヘッダ使用がゼロであること）

## 漏洩時

1. **即時** 該当シークレットを無効化
2. 影響範囲をログで確認（不正 ingest / MQTT publish）
3. デバイスパスワード・INGEST・Webhook を **一括ローテーション**
4. TV は `DELETE /api/tv/devices/:id` で再ペアリング

## TV ペアリングコード

- 有効 10 分、確定後 `pairing_code` は NULL
- ブルートフォース対策: 将来 5 回失敗で 15 分ロック（`google_tv_pairing.md`）

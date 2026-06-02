# 実機接続チェックリスト（Phase 101–120）

実機到着後、拠点ごとにこのリストを順に実施してください。  
各項目は **確認内容 / 合格条件 / 記録** を残します。

## 前提

- [ ] Mosquitto（またはブローカー）起動・認証設定
- [ ] `INGEST_SECRET` を server `.env` と Node-RED に設定
- [ ] `docs/device_id_rules.md` に従いデバイス ID を採番
- [ ] `POST /api/devices/register` で全デバイス登録

---

## ESP32 接続確認

| # | 確認 | 合格条件 |
|---|------|----------|
| 1 | 電源・シリアル | 起動ログが出る |
| 2 | Wi-Fi | 指定 SSID に接続、IP 取得 |
| 3 | MQTT | `tisly/{tenant}/{site}/{device_id}/heartbeat` が 30s 周期 |
| 4 | GPIO 入力 | DI 変化が `.../state` に反映 |
| 5 | リレー出力 | `.../cmd` またはローカルで RO 動作 |
| 6 | イベント | センサー作動 → `.../event` → Node-RED → HTTP ingest |
| 7 | 登録 API | `ESP-HOME-001` が GET `/api/devices` に表示 |

記録: `esp32/TODO.md` の該当行を `[x]` に更新

---

## RP2350 接続確認

| # | 確認 | 合格条件 |
|---|------|----------|
| 1 | PoE / 電源 | 起動、Ethernet Link |
| 2 | `config/gpio_map.json` | Waveshare 公式ピンと一致 |
| 3 | DI/RO 論理 | `active_low` / リレー極性が実測と一致 |
| 4 | MQTT 統一トピック | `tisly/.../RP-HOME-001/...` |
| 5 | heartbeat | 30s、server で `heartbeat_status: ok` |
| 6 | Node-RED | `node-red/tisly_real_device_ingest_v1.json` デプロイ |
| 7 | 100V 前 | テスターで RO 導通のみ（負荷未接続） |

記録: `rp2350/TODO.md`

---

## PLC 接続確認

| # | 確認 | 合格条件 |
|---|------|----------|
| 1 | GX Works 書込・RUN | ラダー動作（`ladder/` 参照） |
| 2 | X/Y 実配線 | セレクタ・非常停止・ビームが想定どおり |
| 3 | MQTT ミラー | M0/M1/M2/X1 が `.../state` に載る |
| 4 | 警報イベント | 立上りで `.../event` + severity `alarm` |
| 5 | 非常停止 | 全出力 OFF、イベント `estop` |

記録: `docs/plc_integration.md` の検証欄

---

## MQTT 疎通

```bash
mosquitto_sub -h <broker> -t 'tisly/#' -v
mosquitto_pub -h <broker> -t 'tisly/default/demo-site/TEST-001/heartbeat' -m '{"ok":true}'
```

- [ ] 購読で heartbeat / state / event が見える
- [ ] ACL（本番）で tenant/site 単位の制限を検討

---

## Node-RED 受信

- [ ] フロー import: `node-red/tisly_real_device_ingest_v1.json`
- [ ] MQTT in → 統一イベント変換 → HTTP POST `/api/events/ingest`
- [ ] debug タブで直近 10 件表示
- [ ] ingest 失敗時リトライキュー動作

---

## PWA 通知

- [ ] iPhone Safari → ホーム画面に追加
- [ ] Push 許可（VAPID 設定時）
- [ ] `POST /api/test/alarm` で通知到達
- [ ] 通知一覧で既読

手順: `docs/pwa_real_demo.md`

---

## Google TV 表示

- [ ] `tv-app` が API に接続（`EXPO_PUBLIC_API_URL`）
- [ ] `POST /api/test/tv-alert` で警報オーバーレイ
- [ ] ペアリング設計: `docs/google_tv_pairing.md`（将来 API）

---

## QNAP 保存

- [ ] `GET /api/qnap/status` — mock でも `archiveDir` 表示
- [ ] `POST /api/qnap/archive/event` — JSON ファイル生成
- [ ] `POST /api/qnap/archive/report` — 週次レポート JSON
- [ ] 実 NAS 接続時: `QNAP_HOST` + SMB マウント（Phase 121+）

---

## Recovery 動作

- [ ] `POST /api/test/recovery` または `/api/recovery/run/:deviceId`
- [ ] `/api/recovery/timeline` にステップ記録
- [ ] 運用コンソールでタイムライン表示

---

## AI Risk 算出

- [ ] デモまたは実イベント後 `GET /api/analytics/risk`
- [ ] Analytics 画面でスコア更新
- [ ] TV ホームに Risk カード（tv-app）

---

## 一括スモーク（実機なし）

```bash
curl -X POST http://localhost:3080/api/test/event
curl -X POST http://localhost:3080/api/test/alarm
curl -X POST http://localhost:3080/api/test/heartbeat -H "Content-Type: application/json" -d "{\"deviceId\":\"ESP-HOME-001\"}"
curl -X POST http://localhost:3080/api/test/tv-alert
curl http://localhost:3080/api/qnap/status
```

---

## 署名

| 拠点 | 実施日 | 担当 | 備考 |
|------|--------|------|------|
| | | | |

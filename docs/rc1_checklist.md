# TiSLY RC1 Production Candidate チェックリスト

**Phase 141–160** — 現場投入前の確認項目です。

## プロビジョニング

- [ ] `POST /api/sites/create` で現場・ゾーン・デフォルト機器が生成される
- [ ] 7 テンプレ（戸建・民泊・工場・倉庫・車屋・養殖場・生コン）が `/api/sites/templates` に存在
- [ ] `POST /api/provisioning/devices` で device_id / secret / site / zone が割当される
- [ ] QR（`qrDataUrl`）を PWA `/setup` で表示・読取できる
- [ ] セットアップウィザード 4 ステップが完了する

## 運用・復旧

- [ ] `/operations` — Site / Zone / Device / TV / Recovery / Health
- [ ] Site Selector / Tenant Selector が localStorage に保持される
- [ ] `/recovery` — 手動 Restart Device / Escalate が API 200 を返す
- [ ] 監査ログが `/api/provisioning/audit` に記録される

## 通知・設定

- [ ] Notification Rule Builder（窓→夜間→critical）が保存できる
- [ ] 保持期間 30 / 90 / 365 日が Settings で設定できる
- [ ] バックアップ daily / weekly / monthly が Settings にある

## QNAP・レポート

- [ ] `QNAP_MODE=mock` でローカルアーカイブが動作
- [ ] `QNAP_MODE=real` + SMB 資格情報の設計が `.env.example` に記載
- [ ] `/api/reports/operations?format=csv|json|pdf` が応答する
- [ ] `/api/reports/sales` が顧客向け JSON を返す

## 実機（現場投入前）

- [ ] ESP32 / RP2350 ファーム書き込み（`docs/esp32_real_device_setup.md`）
- [ ] MQTT ACL/TLS（`docs/mqtt_security_acl_tls.md`）
- [ ] `INGEST_SECRET` を本番値に変更
- [ ] Node-RED フロー import（`node-red/tisly_real_device_ingest_v1.json`）
- [ ] Google TV ペアリング（tv-app PairingScreen）

## ビルド

```bash
cd server && npm run build && npm run test
```

- [ ] E2E が phase `141-160-rc1` / sites create を含む
- [ ] `npm run demo` で運用コンソールにイベントが流れる

## 営業

- [ ] `docs/demo_runbook.md` の 5 分デモが再現できる
- [ ] `/sales` が顧客向けに表示される

未完了項目の整理: `docs/production_todo.md`

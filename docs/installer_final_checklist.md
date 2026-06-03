# 施工 PWA 最終チェックリスト（Phase 401–420）

実機接続前に現場で確認する項目です。

## インフラ

- [ ] PWA **HTTPS**（自己署名でない本番証明書推奨）
- [ ] Service Worker 登録（`/service-worker.js`）
- [ ] `FIELD_LIVE_MODE` / モードバナー表示が意図どおり

## プロビジョニング

- [ ] **QR スキャン**（カメラ or 手入力 JSON）
- [ ] **NFC fallback**（Web NFC 不可時は UID 手入力）
- [ ] Claim 後ダッシュボード「登録済」増加

## オフライン

- [ ] 機内モードで QR/NFC/チェックリストをキュー
- [ ] 復帰後 **同期** — ステータス `synced` / `failed` / `conflict` 表示
- [ ] Background Sync タグ `tisly-installer-sync`

## 通信・証明書

- [ ] **MQTT RTT** (`POST .../test/mqtt-rtt`)
- [ ] **Live MQTT ACK** (`POST .../test/live-mqtt`)
- [ ] **Cert status** — CSR 登録 → 発行 → 状態確認
- [ ] **Firmware config** JSON 取得

## ラベル・写真

- [ ] **テプラ CSV** — `GET .../labels/tepra.csv`
- [ ] **Brother CSV** — `GET .../labels/brother.csv`
- [ ] **QR SVG** — `GET .../:id/qr.svg`
- [ ] **Photo upload** — before / after / wiring / device_label / panel / test_result

## マップ・完了

- [ ] **Map placement** — Map Editor でピン配置
- [ ] **Completion report** — `locale=ja` と `locale=en`
- [ ] 未完了のみ表示トグル

## テストコマンド

```bash
cd server && npm run build && npm run test
# field-live-connection.test.ts を含む
```

## 関連ドキュメント

- `docs/first_real_device_connection_runbook.md`
- `docs/mqtt_acl_ack_field_test.md`
- `docs/label_printer_integration.md`

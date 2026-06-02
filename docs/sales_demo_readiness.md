# 営業デモ完成度チェック（Phase 101–120）

実機の有無に関わらず、商談前に以下を確認してください。

## チェックリスト

| # | 項目 | 確認方法 | 状態 |
|---|------|----------|------|
| 1 | iPhone で見られる | Safari → `http://<IP>:3080/` | ☐ |
| 2 | PWA 通知が来る | VAPID 設定 + `POST /api/test/alarm` | ☐ |
| 3 | TV で警報表示 | `POST /api/test/tv-alert` + tv-app / `/tv` | ☐ |
| 4 | ダッシュボード | `/` および `/operations` | ☐ |
| 5 | AI レポート | `/analytics` `GET /api/analytics/risk` | ☐ |
| 6 | Recovery タイムライン | `/api/recovery/timeline` | ☐ |
| 7 | 実機なしで説明できる | `npm run demo` + 本ドキュメント | ☐ |
| 8 | 実機ありでも繋げられる | `docs/real_device_integration_checklist.md` | ☐ |

## 5 分デモ台本

1. **起動** — `npm run demo`（仮想 5 拠点）
2. **ダッシュボード** — マップ・Alarm 件数
3. **AI** — `/sales` または `/analytics` でリスクスコア
4. **Recovery** — 運用コンソールでタイムライン
5. **通知** — `curl -X POST .../api/test/alarm` → PWA
6. **TV** — プレビュー `/tv` または tv-app
7. **実機ストーリー** — 統一 MQTT + デバイス ID ルールを図示

## API クイック参照

| 用途 | エンドポイント |
|------|----------------|
| テスト警報 | `POST /api/test/alarm` |
| デバイス登録 | `POST /api/devices/register` |
| QNAP デモ | `GET /api/qnap/status` |
| デモ再開 | `POST /api/demo/start` |

## 既知の制限（正直に説明）

- QNAP 実 NAS は mock（ローカル `data/qnap-archive`）
- TV ペアリング API は設計のみ（`docs/google_tv_pairing.md`）
- MQTT は server 直結ではなく Node-RED ingest 推奨
- `npm run test` は未整備（手動 curl / ビルドで代替）

## 商談持ち出し物

- [ ] iPhone（PWA 追加済み）
- [ ] Google TV または `/tv` タブ
- [ ] PC（デモ起動済み）
- [ ] `docs/demo_sales_guide.md` 印刷 or PDF

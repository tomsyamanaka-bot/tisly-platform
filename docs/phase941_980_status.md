# Phase 941–980 完了ステータス

## 実装サマリー

| # | 項目 | 状態 |
|---|------|------|
| 1 | Shelly 実機 E2E | ✅ `/api/shelly/*` + env + confirm/dryRun |
| 2 | ESP32 MQTT 本番トピック | ✅ `esp-topic-standard.ts` + デモ互換 |
| 3 | 営業 WS リアルタイム | ✅ `sales-realtime.js` + hub 拡張 |
| 4 | Google TV ミラー | ✅ `tv-dashboard.js` WS + リモコン |
| 5 | node-cron デモリセット | ✅ `demo-reset-cron.ts` |
| 6 | 営業 i18n ja/en | ✅ `sales-i18n.js` |
| 7 | /sales オフライン PWA | ✅ SW v941 |
| 8 | テスト 5本 | ✅ |
| 9 | build / tsc | ✅ |

## 確認 URL

- http://localhost:3080/sales
- http://localhost:3080/sales/floor-preview?customer=TOMS001
- http://localhost:3080/devices
- http://localhost:3080/tv/TOMS001
- http://localhost:3080/api/shelly/status
- http://localhost:3080/api/demo-kit/reset-schedule

## Phase 981–1000 候補

- Shelly 実機 CI（ハードウェアラボ）
- ESP ファームウェア OTA + プロビジョニング連携
- 営業 UI 中文
- Puppeteer 見積 PDF + QNAP 自動配置
- WS 認証（営業/TV トークン）

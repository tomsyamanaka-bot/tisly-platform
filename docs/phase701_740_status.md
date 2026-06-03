# Phase 701–740 ステータス

**Live Operations Automation & PRO Remote Polish**

| # | 項目 | 状態 | 備考 |
|---|------|------|------|
| 1 | WebSocket Live Push | ✅ | `/ws` + mock 12s · devices/notifications/timeline/floor_alert |
| 2 | Floor 自動ジャンプ | ✅ | 手動操作45s pause · 10s pin blink |
| 3 | Gmail/QNAP retry queue | ✅ | DB + timeline + UI |
| 4 | Puppeteer PDF 本番準備 | ✅ | 見積/請求/完了/仕様書統一 · HTML fallback |
| 5 | 保守 Workflow | ✅ | Hub Today · 期限切れ warning · close→closed |
| 6 | 図面差分 v2 | ✅ | 青/赤/黄 · クリックでピン |
| 7 | AI見積 feedback | ✅ | `ai_estimate_feedback` |
| 8 | Shared Service Worker | ✅ | v701 priority cache |
| 9 | Multi Tenant KPI | ✅ | byCustomer / bySite / anomaly |
| 10 | Build / Test | ✅ | `business-phase701.test.ts` |
| 11 | Docs | ✅ | 本ディレクトリ + README |

## 検証

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

## Phase 741–780 提案

1. 本番 MQTT → `live-push-bridge` 直結（mock 停止フラグ）
2. Gmail OAuth 本番 + retry worker バックグラウンド
3. QNAP WebDAV 本番 + 仕様書自動アップロード
4. AI見積 外部モデル接続 + feedback 学習バッチ
5. 司令塔オフライン同期（IndexedDB 案件スナップショット）
6. PRO Remote 双方向 WS（フロア操作の遠隔ミラー）
7. 顧客ポータル KPI エクスポート CSV
8. Puppeteer CI スナップショット PDF 回帰テスト

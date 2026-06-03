# Phase 741–780 ステータス

**Real Connection, External Sync & Operator Polish**

| # | 項目 | 状態 | 備考 |
|---|------|------|------|
| 1 | MQTT live-push bridge | ✅ | `MQTT_MOCK_MODE=false` · mock push 停止 · ログ |
| 2 | Gmail OAuth retry worker | ✅ | `gmail_send_queue` · timeline · mockOnly |
| 3 | QNAP WebDAV real upload | ✅ | PUT/MKCOL · retry queue |
| 4 | AI feedback learning | ✅ | 集計 · v3 候補反映 |
| 5 | Offline snapshot | ✅ | IndexedDB · 手動同期 |
| 6 | PRO Remote 双方向 WS | ✅ | pro_mirror · timeline |
| 7 | KPI CSV | ✅ | `/api/toms/kpi/csv` · customer CSV |
| 8 | Puppeteer PDF 回帰 | ✅ | html fallback · phase741 test |
| 9 | UI polish | ✅ | 接続バッジ · 大ボタン · 10s highlight |
| 10 | Build / Test | ✅ | `business-phase741.test.ts` |
| 11 | Docs | ✅ | 本ディレクトリ + README |

## 検証

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

## Phase 781–820 提案

1. MQTT TLS + 本番ブローカー認証（クライアント証明書）
2. Gmail `users.messages.send` 本番 + DLQ アラート
3. QNAP 差分同期・バージョン管理
4. 外部 LLM 接続 + feedback 週次バッチ
5. App Hub Background Sync API
6. PRO Remote WebRTC 低遅延映像
7. KPI BigQuery エクスポート
8. PDF visual regression（pixelmatch）

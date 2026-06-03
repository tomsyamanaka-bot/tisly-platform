# Phase 821–860 — Demo Kit & Sales Ready Mode

| # | 項目 | 状態 |
|---|------|------|
| 1 | Demo Customer Pack（5顧客） | ✅ |
| 2 | Demo Timeline Generator（30日） | ✅ |
| 3 | Demo Floor Maps（外周/1F/2F + ピン） | ✅ |
| 4 | Demo KPI（売上・粗利・保守・未入金・契約） | ✅ |
| 5 | Demo Notifications（5種） | ✅ |
| 6 | Demo AI Estimate（mock） | ✅ |
| 7 | Sales Presentation Mode `/sales` | ✅ |
| 8 | One Click Demo Reset | ✅ |
| 9 | build / tsc / test | ✅ |
| 10 | ドキュメント | ✅ |

## API 一覧

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/demo-kit/status` | パック・KPI・図面状況 |
| POST | `/api/demo-kit/reset` | フルリセット |
| POST | `/api/demo-kit/ensure` | idempotent シード |
| POST | `/api/demo-kit/notifications/:kind` | 通知デモ |
| POST | `/api/demo-kit/ai-estimate` | AI見積デモ |
| GET | `/api/demo-kit/kpi` | TOMS KPI |

## テスト

- `server/test/business-phase821.test.ts`

## ドキュメント

- [demo_customer_pack.md](./demo_customer_pack.md)
- [demo_floor_maps.md](./demo_floor_maps.md)
- [demo_timeline.md](./demo_timeline.md)
- [demo_notifications.md](./demo_notifications.md)
- [sales_mode.md](./sales_mode.md)
- [demo_reset.md](./demo_reset.md)

## Phase 861–900 提案

1. 営業画面からのライブ WS プレビュー（PRO Remote 同期表示）
2. デモ顧客ごとの PDF 見積サンプル自動生成
3. Google TV / PWA へのデモ通知ミラー
4. 多言語営業モード（EN/中文）
5. デモ KPI の BigQuery エクスポート
6. 実機 ESP/Shelly とのデモブリッジ（mock 切替）
7. 顧客向け ROI 計算機（削減効果シミュレータ）
8. デモリセットのスケジュール（毎朝自動）

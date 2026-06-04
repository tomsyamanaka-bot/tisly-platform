# Phase 861–900 — Sales Demo Polish & Real Device Preview

| # | 項目 | 状態 |
|---|------|------|
| 1 | `/sales` 営業トップ（平易な文言・カード） | ✅ |
| 2 | 大きめデモ操作ボタン | ✅ |
| 3 | PRO Remote 図面プレビュー `/sales/floor-preview` | ✅ |
| 4 | 見積 PDF（HTML fallback）3種 | ✅ |
| 5 | Google TV / PWA 導線 | ✅ |
| 6 | デモ KPI CSV 出力 | ✅ |
| 7 | デモ自動リセット schedule（mock） | ✅ |
| 8 | build / tsc / test | ✅ |
| 9 | ドキュメント | ✅ |

## API 追加

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/demo-kit/status` | phase `861-900`、出動削減見込み付き KPI |
| GET | `/api/demo-kit/kpi/csv` | 営業デモ用 KPI CSV |
| GET | `/api/demo-kit/floor-preview/:customerCode` | 外周/1F/2F + ピン色 |
| POST | `/api/demo-kit/shelly-reboot` | Shelly 再起動デモ |
| GET | `/api/demo-kit/estimate-html/:type` | house / minpaku / factory |
| GET/PUT | `/api/demo-kit/reset-schedule` | 自動リセット mock 設定 |

## 画面

| URL | 用途 |
|-----|------|
| `/sales` | 営業デモトップ |
| `/sales/floor-preview` | 図面縦スクロール・異常時スクロール |

## テスト

- `server/test/business-phase861.test.ts`

## ドキュメント

- [sales_demo_operation.md](./sales_demo_operation.md)
- [pro_remote_floor_preview.md](./pro_remote_floor_preview.md)
- [demo_pdf_estimate.md](./demo_pdf_estimate.md)
- [demo_kpi_export.md](./demo_kpi_export.md)
- [google_tv_pwa_demo.md](./google_tv_pwa_demo.md)

## Phase 901–940 提案

1. 営業画面から PRO Remote へのライブ WS 同期プレビュー
2. Puppeteer による見積 PDF 実ファイル生成と QNAP 連携デモ
3. Google TV へのデモ通知ミラー（同一イベント表示）
4. 多言語営業モード（EN / 中文）
5. 実機 ESP / Shelly ブリッジ（mock ↔ live 切替）
6. ROI シミュレータ（削減効果の入力式）
7. デモリセットの cron 実装（node-cron）
8. 営業デモ用オフライン PWA（`/sales` 単体キャッシュ）

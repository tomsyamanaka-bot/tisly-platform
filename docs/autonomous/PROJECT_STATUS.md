# プロジェクト標準仕様（完成状態）

**最終更新:** 2026-06-10  
**対象:** TiSLY Practical PWA（現調 v1 / 見積 v1 / 日程 v1）

Cursor が長時間自走する際の **「壊してはいけない完成仕様」** の単一ソースです。新しい実装を始める前に必ず読んでください。

---

## インフラ・デプロイ

| 項目 | 状態 |
|------|------|
| VPS Auto Deploy | **成功済み**（GitHub Actions `deploy-vps.yml`） |
| 通常の反映フロー | `master` へ commit/push → CI → VPS 自動更新 |
| VPS 手動更新 | **基本不要**（Actions 失敗時のみ人間が介入） |
| 成功確認 URL | https://tisly.jp/api/health の `commitShort` が push した commit の先頭 7 文字と一致 |
| 詳細手順 | [VPS_AUTO_DEPLOY.md](./VPS_AUTO_DEPLOY.md) |

---

## 写真管理（現調 vs 完了報告書）

| 種類 | 保存先 | 用途 |
|------|--------|------|
| **現調写真** | `survey_photos`（現調 PWA） | 仕様書 PDF のみ |
| **完了報告書用写真** | `completion_photos`（見積 PWA） | 完了報告書 PDF のみ |

**必須ルール**

- 現調写真と完了報告書用写真は **別管理**。混在・相互参照をしない。
- 仕様書 PDF → `buildReportPhotosV1()`（現調写真）
- 完了報告書 PDF → `buildCompletionPhotosV1()`（完了報告書用写真のみ）
- 見積書 PDF・請求書 PDF → **写真を載せない**（`includePhotos` は実務 PWA では常に false）

### 完了報告書用写真 UI（完成済み）

- 写真ライブラリから複数選択で追加
- タイトル保存（PATCH）
- サムネイル表示
- タップで拡大
- 削除
- 完了報告書 PDF へ反映

### 現調写真 UI（完成済み）

- 写真追加・タイトル保存（`survey_photos.comment`）
- 仕様書 PDF にタイトル付きで反映（未入力は「写真1」形式）

---

## PDF レイアウト（完成済み）

| 帳票 | 写真 | レイアウト要点 |
|------|------|----------------|
| 仕様書 | 現調写真 | 上部余白削減、案件情報コンパクト、2列×4段（最大8枚/ページ） |
| 完了報告書 | 完了報告書用写真のみ | 写真優先レイアウト、上部余白削減 |
| 見積書 | なし | TOMS 左右分割ヘッダ（`renderTomsDocLayoutHeader`） |
| 請求書 | なし | 見積書と同系の左右分割レイアウト |

---

## 日程・Google カレンダー / Maps（完成済み）

| 機能 | 状態 |
|------|------|
| 日程詳細の日付メモ | `schedule_unavailable_days.detail_memo` に保存（現場不可とは別） |
| 予定フィールド表示 | title / start / end / location / description を週間・日詳細に反映 |
| Google カレンダー予定の説明 | 一覧・日詳細で表示（折りたたみ/展開） |
| 場所の地図ボタン | location がある予定に Google マップリンク |
| Google 同期 | `GOOGLE_CALENDAR_ENABLED` でモック/本番切替 |
| 連携ステータス UI | `未設定` / `仮連携中` / `本番連携済み` バッジ（Calendar・Maps） |
| 移動時間（日程詳細） | `現在地→現場` / `前の現場→次の現場` ブロック + ナビ起動 |
| Maps API 未設定時 | 目安時間 + 「Google Maps API未設定：ナビ起動のみ」 |
| Maps API 設定後 | `GOOGLE_MAPS_API_KEY` で Directions API 取得（`（API）` 表示） |

---

## 主要 URL（本番 / ローカル共通パス）

| 画面 | パス |
|------|------|
| App Hub | `/app` |
| 日程調整 | `/schedule-v1` |
| 日程詳細 | `/schedule-day-v1?date=YYYY-MM-DD` |
| 現調 | `/survey-v1` |
| 見積・請求・完了報告 | `/estimate-v1` |

ログイン例: `TOMS001` / `toms001.surveyor` / `.env` の `CUSTOMER_DEMO_PASSWORD`

---

## 顧客別単価ルール（完成済み）

| 項目 | 内容 |
|------|------|
| テーブル | `customer_price_rules`（`customer_id` → `business_customers`） |
| 材料単価 | 部材原価 × `cost_multiplier` |
| 労務単価 | 労務原価 × `labor_multiplier`（category=labor または名称マッチ） |
| 出精値引き | `business_estimates.shusei_discount_amount` / `shusei_discount_memo` |
| 計算 | 明細合計 − 出精値引き = 小計 → 税10% → 税込合計 |
| UI | 見積詳細に単価ルール・倍率・出精値引きを表示 |
| PDF | 出精値引き行を `renderTotals` に反映 |
| テスト | `server/test/customer-price-rules.test.ts` |

---

## 主要コード参照

| 領域 | パス |
|------|------|
| 顧客別単価ルール | `server/src/business/customer-price-rules.ts` |
| 税・値引き計算 | `server/src/business/estimate-math.ts` |
| 写真分離ロジック | `server/src/estimate/estimate-v1-store.ts` |
| 完了報告書用写真 API/Store | `server/src/estimate/completion-photos-store.ts` |
| 仕様書 PDF テンプレ | `server/src/estimate/specification-template.ts` |
| 完了報告書 PDF テンプレ | `server/src/estimate/practical-completion-report-template.ts` |
| 見積・請求 PDF テンプレ | `server/src/business/pdf/estimate-template.ts`, `invoice-template.ts` |
| 完了報告書写真 UI | `server/public/js/estimate-v1.js` |
| 日程日付メモ UI | `server/public/js/schedule-day-v1.js` |
| Google 説明・地図・移動時間 UI | `server/public/js/schedule-event-ui.js`, `schedule-v1.js`, `schedule-day-v1.js` |
| Maps / 移動時間 API | `server/src/schedule/google-maps-service.ts`, `route-planner-service.ts` |
| 人間設定一覧 | [HUMAN_ACTIONS.md](./HUMAN_ACTIONS.md) |

---

## 関連ドキュメント

- [CURSOR_SELF_DRIVE_RULES.md](./CURSOR_SELF_DRIVE_RULES.md) — 自走時の行動規範
- [checklists/REGRESSION_TEST.md](./checklists/REGRESSION_TEST.md) — 回帰テスト項目
- [examples/EXAMPLE_INDEX.md](./examples/EXAMPLE_INDEX.md) — お手本カテゴリ索引
- [templates/NEXT_CURSOR_PROMPT.md](./templates/NEXT_CURSOR_PROMPT.md) — 次回作業用プロンプト雛形

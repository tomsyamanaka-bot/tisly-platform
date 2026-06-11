# プロジェクト標準仕様（完成状態）

**最終更新:** 2026-06-11  
**対象:** TiSLY Practical PWA（現調 v1 / 見積 v1 / 日程 v1 / 持ち物 v1 / 発注 v1 / 到着・作業完了 v1 / 書類閲覧 UX v1）

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
| 連携設定 PWA | `/google-calendar-settings-v1` — ログイン・カレンダー選択・双方向同期 |
| OAuth コールバック | `https://tisly.jp/auth/google/callback` |
| 案件↔予定リンク | `google_calendar_event_links` — 自動生成・完了 ✅ 反映 |
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
| 持ち物チェック | `/field-check-v1` |
| 発注管理 | `/purchase-v1` |

ログイン例: `TOMS001` / `toms001.surveyor` / `.env` の `CUSTOMER_DEMO_PASSWORD`

---

## 顧客別単価ルール v1.2（完成済み）

| 項目 | 内容 |
|------|------|
| テーブル | `customer_price_rules` + 見積 `price_rule_*` / `apply_price_rule` / `shusei_discount_*` |
| 材料単価 | 部材原価 × `cost_multiplier` |
| 労務単価 | 標準労務原価 × `labor_multiplier`（category=labor または名称マッチ） |
| その他明細 | 手入力単価を優先（`category=other` 等は倍率対象外） |
| 出精値引き | `shusei_discount_amount` / `shusei_discount_memo` |
| 計算 | 明細合計 − 出精値引き = 小計 → 税10% → 税込合計 |
| UI | 顧客名・ルール選択（客A/B/管理会社A/一般個人/法人標準/手動調整）・材料/労務倍率入力・「倍率で再計算」・出精値引き |
| 手入力保護 | 再計算時「手入力の単価があります。上書きしますか？」（上書き / 残す） |
| API | `GET /api/estimate/v1/price-rules`、`PATCH items` に `priceRule` / `applyPriceRule` |
| PDF（お客様） | 出精値引き・税抜小計・消費税・税込合計、備考に「顧客別単価ルール適用」（**倍率は非表示**） |
| PDF（社内） | TOMS データに `priceRule` 倍率を含む |
| テスト | `server/test/customer-price-rules.test.ts`（9ケース） |

---

## 出発リマインダー + 持ち物通知 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 出発時間 | 各日の最初の工事予定のみ — 開始 − 移動時間 − 10分（Maps API / 目安） |
| DB | `schedule_day_departures` |
| API | `GET/PATCH /api/schedule/v1/departures`, `POST .../test-notify` |
| 日程 UI | 週間カード・日詳細に「🚐 出発準備」ブロック |
| 通知 | ブラウザ通知（許可時）+ iPhone PWA 向け画面内アラート |
| 持ち物連動 | 通知タップ → `/field-check-v1?projectId&source&date`、不足材料を赤表示 |
| 案件ホーム | `todayDeparture` カード（出発 / 通知 / 持ち物を見る） |
| テスト | `server/test/departure-reminder-v1.test.ts`（10ケース） |

---

## 到着・作業完了システム v1（完成済み）

| 領域 | 内容 |
|------|------|
| 到着 | 日程詳細・案件詳細の「現場到着」→ `arrival_time` + GPS（任意） |
| 作業開始 | 到着後「作業開始」→ `start_time` |
| 作業完了 | 「作業完了」→ `completion_time`、案件ステータスを施工中→完了へ |
| 完了写真 | `completion_photos`（見積 PWA）— 作業完了後も複数追加可 |
| 完了チェック | 工事種別（防犯カメラ/LAN 等）から案件別チェックリスト自動生成 |
| 完了報告書 | 「完了報告書作成」— 作業時間・内容・チェック結果・写真を PDF 反映 |
| 案件パイプライン 9 段 | 現調→見積→受注→持ち物→発注→**施工中**→**完了**→請求→入金 |
| 案件ホーム | 今日の施工中 / 今日の完了 / 今月完了 カード |
| DB | `project_work_sessions`, `completion_checklist_items` |
| API | `/api/work-session/v1`（arrival/start/complete/checklist） |
| テスト | `server/test/work-completion-v1.test.ts`（8ケース） |

**将来利用:** `arrival_time` / `start_time` / `completion_time` は工数・粗利・作業時間分析用に保持

---

## Field Operations System v1（完成済み）

| 領域 | 内容 |
|------|------|
| 材料マスター | `materials` テーブル — カテゴリ/品名/原価/在庫/発注先 |
| 工事テンプレ | `work_templates` + `work_template_items` — 例: 防犯カメラ4台 |
| 持ち物 PWA | `/field-check-v1` — 出発前チェック + 履歴 `field_check_sessions` |
| 発注 PWA | `/purchase-v1` — 不足抽出・発注前→発注済→入荷済→現場持込済 |
| 案件連動 | 現調で工事テンプレ選択 → 部材/持ち物/発注を自動生成 |
| 下部ナビ | 日程/現調/見積/請求/案件/持ち物/発注（7タブ） |
| API | `/api/materials/v1`, `/api/field-check/v1`, `/api/purchase/v1` |
| テスト | `server/test/field-operations-v1.test.ts`（9ケース） |

**必須ルール**

- 現調写真（`survey_photos`）と完了報告書用写真（`completion_photos`）の分離は維持
- 工事テンプレからの現調部材は `survey_materials.memo = '__auto_template__'` で識別
- 発注の在庫更新: 入荷で `stock_qty` 加算、現場持込で減算

---

## Document Viewer UX v1（完成済み）

| 領域 | 内容 |
|------|------|
| 画面 | `/document-viewer-v1.html?projectId=&kind=` |
| 対象書類 | 見積 / 請求 / 仕様 / 完了報告 / 現場報告 |
| モバイル | `width < 768` でカード UI（PDF 縮小表示は使わない） |
| デスクトップ | 従来どおり PDF iframe プレビュー |
| 固定ヘッダー | ← 戻る / 案件名 / 共有 / 印刷 / PDF |
| 見積 | 御見積金額ヒーロー + 明細カード + 下部固定税込合計 |
| 請求 | 請求金額ヒーロー + 振込先コピー |
| 仕様書 | 写真 1 列 100% + タップ拡大 |
| 完了報告 | 作業時間ヒーロー + チェックカード + 写真スワイプ |
| 案件画面 | 見積・請求・仕様・完了報告をモーダルではなく画面遷移で開く |
| API | `GET /api/estimate/v1/projects/:id/document-view?kind=` |
| PDF | **印刷用 PDF テンプレートは変更なし**（閲覧 UI のみ） |
| テスト | `server/test/document-viewer-v1.test.ts`（7ケース） |

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
| 材料マスター / 工事テンプレ | `server/src/field-ops/materials-v1-store.ts`, `work-templates-store.ts` |
| 持ち物 / 発注 | `server/src/field-ops/field-check-v1-store.ts`, `purchase-v1-store.ts` |
| 到着・作業完了 | `server/src/field-ops/work-session-v1-store.ts`, `server/public/js/work-session-ui.js` |
| 案件連動（テンプレ適用） | `server/src/field-ops/project-materials-service.ts` |
| 持ち物 PWA UI | `server/public/js/field-check-v1.js` |
| 発注 PWA UI | `server/public/js/purchase-v1.js` |
| 書類閲覧 UX v1 | `server/public/document-viewer-v1.html`, `server/public/js/document-viewer-v1.js`, `server/src/estimate/document-view-v1.ts` |
| 人間設定一覧 | [HUMAN_ACTIONS.md](./HUMAN_ACTIONS.md) |

---

## 関連ドキュメント

- [CURSOR_SELF_DRIVE_RULES.md](./CURSOR_SELF_DRIVE_RULES.md) — 自走時の行動規範
- [checklists/REGRESSION_TEST.md](./checklists/REGRESSION_TEST.md) — 回帰テスト項目
- [examples/EXAMPLE_INDEX.md](./examples/EXAMPLE_INDEX.md) — お手本カテゴリ索引
- [templates/NEXT_CURSOR_PROMPT.md](./templates/NEXT_CURSOR_PROMPT.md) — 次回作業用プロンプト雛形

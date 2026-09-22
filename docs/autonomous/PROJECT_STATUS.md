# プロジェクト標準仕様（完成状態）

**最終更新:** 2026-09-22  
**対象:** TiSLY Practical PWA（現調 v1 / 見積 v1 / 日程 v1 / 持ち物 v1 / 発注 v1 / 到着・作業完了 v1 / 書類閲覧 UX v1 / Knowledge Acquisition v1）

Cursor が長時間自走する際の **「壊してはいけない完成仕様」** の単一ソースです。新しい実装を始める前に必ず読んでください。

---

## UI 基調（完成状態）

| 項目 | 状態 |
|------|------|
| 実務 PWA テーマ | **白ベース（ライト）× 紺色アクセント** — `tisly-neon-dark` クラス互換のまま CSS をライト回帰 + navy `#1E3A8A` 追記 |
| 背景 | `#ffffff` 〜 `#F8FAFC` |
| テキスト | `#0F172A` / `#333333` |
| メイン／アクセント | 紺色 `#1E3A8A` / `#0F172A` / `#1E293B` |
| SW | `tisly-pwa-v2561-event-slider-split` |

---

## インフラ・デプロイ

| 項目 | 状態 |
|------|------|
| VPS Auto Deploy | **成功済み**（GitHub Actions `deploy-vps.yml` · `cancel-in-progress:false` · localhost health 先行） |
| 通常の反映フロー | `master` へ commit/push → CI → VPS 自動更新 |
| VPS 手動更新 | **基本不要**（Actions 失敗時のみ人間が介入） |
| 成功確認 URL | https://tisly.jp/api/health の `commitShort` が push した commit の先頭 7 文字と一致 |
| 詳細手順 | [VPS_AUTO_DEPLOY.md](./VPS_AUTO_DEPLOY.md) |
| 502 対策（2026-08-21） | listen 先行起動 · nginx `proxy_next_upstream` リトライ · systemd `StartLimit*` を `[Unit]` へ · `scripts/vps-recover-502.sh` |

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
| 仕様書 | 現調写真 | A4縦・1ページ目=表紙（システム構成/機器一覧等）・2ページ目以降=2列×3段（6枚/ページ）・ページフッター |
| 完了報告書 | 完了報告書用写真のみ | A4縦・1ページ目=表紙（作業内容/使用部材等）・2ページ目以降=2列×3段（6枚/ページ）・ページフッター |
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
| 現場チェックリスト | `/field-checklist-v1` |
| チェックリスト管理 | `/checklist-templates-v1`（設定から） |
| 発注管理 | `/purchase-v1` |
| TiSLY Monitoring 3D V1 | `/tisly-monitoring-3d-v1` |
| TiSLY Monitoring 3D V3 | `/monitoring-3d-v2` |
| TiSLY Monitoring mapAsset Manager V3.2 | `/monitoring-map-assets-v1` |
| 設定（管理者） | `/settings-v1` |
| ナレッジ検索 | `/knowledge-search-v1` |
| 現場ナレッジ | `/knowledge-field-v1` |
| ナレッジ詳細 | `/knowledge-detail-v1?id=` |
| お客様向けナレッジ | `/knowledge-customer-v1` |
| お客様向けナレッジ V2 | `/knowledge-customer-v2` |
| お客様向け案件ページ | `/knowledge-customer-project-v1?ref=DEMO-HOME-001` |
| お客様向け Site Map | `/knowledge-customer-site-map-v1?ref=DEMO-HOME-001` |
| お客様向け案件一覧 | `/knowledge-customer-projects-v1` |
| お客様向けPDF閲覧 | `/knowledge-customer-document-v1?ref=&fileId=` |
| お客様向け詳細 | `/knowledge-customer-detail-v1?id=` |
| ナレッジ使用ログ | `/knowledge-usage-dashboard-v1` |
| ストレージ設定 | `/storage-settings-v1` |
| 見積マスター | `/master-v1` |
| 価格・原価マスター | `/price-cost-master-v1` |
| AI見積エンジン基盤 | `/ai-estimate-engine-v1` → `/master-v1?tab=stats` |
| 現調図面 | `/survey-drawing-v1` |
| 案件ダッシュボード | `/project-dashboard-v1` |
| 案件詳細（実運用） | `/project-mgmt-detail-v1?projectId=` |
| Route Health | `/route-health` |
| 書類センター | `/document-center-v1`（別名 `/documents-v1`） |
| TiSLY HOME 住設統合（社内） | `/home-v1` · `/app/home` |
| TiSLY HOME 住まい（お客様） | `/customer/home` |
| ホームセキュリティ俯瞰（社内） | `/security-v1` · `/app/security-v1` |
| ホームセキュリティ俯瞰（お客様） | `/customer/security` |

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
| 現場チェックリスト | 到着時に工事種別テンプレから自動生成 — タップで完了・自動保存 |
| チェック項目写真 | 項目ごとに `completion_photos` へ添付（現調写真と分離） |
| 完了チェック | 未完了項目あり → 作業完了拒否（UI から force 可） |
| 完了報告書 | 「完了報告書作成」— 作業時間・内容・✓チェック結果・写真を PDF 反映 |
| テンプレート管理 | `/checklist-templates-v1` — 追加/編集/複製/削除 + 月間集計 |
| 案件パイプライン 9 段 | 現調→見積→受注→持ち物→発注→**施工中**→**完了**→請求→入金 |
| 案件ホーム | 今日の施工中 / 今日の完了 / 今月完了 カード + **チェックリスト**タブ |
| DB | `project_work_sessions`, `completion_checklist_items`, `field_checklist_templates` |
| API | `/api/work-session/v1`, `/api/field-checklist/v1` |
| テスト | `server/test/work-completion-v1.test.ts`, `server/test/field-checklist-v1.test.ts` |

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

## 案件 PDF 保存 v1（完成済み — ローカル固定 + QNAP バックアップ）

| 領域 | 内容 |
|------|------|
| 保存先 | `uploads/business/{projectId}/pdfs/` |
| ファイル名 | `estimate-{番号}.pdf` / `invoice-{番号}.pdf` / `report-{タイトル}.pdf` |
| 表示 | PWA は **保存済み PDF を優先**（再生成は明示ボタンのみ） |
| 共有 | iPhone Safari / PWA → Web Share API、非対応 → URL コピー |
| メール | **標準では送信しない** |
| QNAP バックアップ | **完成済み** — ローカル保存成功後に WebDAV へ自動送信（失敗してもローカル PDF は維持） |
| QNAP 保存先 | `/TiSLY/projects/{projectId}/estimate/` / `invoice/` / `specification/` / `completion-report/` |
| QNAP 接続設定 UI | **完成済み** — `/settings-v1` → `/storage-settings-v1`（管理者専用） |
| QNAP Worker | `qnap-pdf-backup-worker` — pending/failed（最大3回）を再送 |
| 案件 UI | `/projects-v1` 書類セクション — **仕様書・見積書・完了報告書・請求書** タブ、ローカル/QNAP 状態、失敗時「QNAPへ再同期」 |
| DB | `project_pdf_meta` — qnap_backup_* 列 |
| 仕様書 | [`docs/project-pdf-storage-spec.md`](../project-pdf-storage-spec.md) |
| API | `GET/POST/DELETE /api/projects/v1/projects/:id/pdfs/...` + `POST .../qnap-resync` |
| テスト | `server/test/project-pdf-v1.test.ts`, `server/test/qnap-pdf-backup-v1.test.ts` |

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
| 現場チェックリスト | `server/src/field-ops/field-checklist-templates-store.ts`, `server/public/js/field-checklist-ui.js`, `field-checklist-v1.html` |
| 案件連動（テンプレ適用） | `server/src/field-ops/project-materials-service.ts` |
| 持ち物 PWA UI | `server/public/js/field-check-v1.js` |
| 発注 PWA UI | `server/public/js/purchase-v1.js` |
| 書類閲覧 UX v1 | `server/public/document-viewer-v1.html`, `server/public/js/document-viewer-v1.js`, `server/src/estimate/document-view-v1.ts` |
| QNAP ストレージ設定 | `server/public/storage-settings-v1.html`, `server/src/storage/storage-settings-store.ts`, `server/src/storage/qnap-storage-service.ts` |
| QNAP PDF バックアップ | `server/src/projects/project-pdf-qnap-store.ts`, `server/src/storage/qnap-pdf-backup-service.ts`, `server/src/workers/qnap-pdf-backup-worker.ts` |
| TiSLY MotherShip | `scripts/backup-qnap.ps1`, `scripts/qnap-diagnose.ps1`, `scripts/deploy-all.ps1`, `server/src/storage/mothership-paths-v1.ts` |
| 人間設定一覧 | [HUMAN_ACTIONS.md](./HUMAN_ACTIONS.md) |

---

## 次フェーズ用メモ（QNAP PDF バックアップ完成後）

| 方針 | 内容 |
|------|------|
| PDF の正 | **ローカル保存が正** — `uploads/business/{projectId}/pdfs/` |
| QNAP の役割 | **バックアップ専用** — ローカル成功後に WebDAV 送信。失敗しても現場 PDF は維持 |
| メール | **標準では送信しない** |
| 共有 | iPhone Safari / PWA の **Web Share API**（非対応時は URL コピー） |
| QNAP 接続方式 | **WebDAV**（`/storage-settings-v1` で設定） |
| 次フェーズ | **案件完了報告書 PDF の実用化** |
| その次 | **QNAP 日次整合チェック**（ローカル vs QNAP の突合） |

### QNAP 日次整合チェック v1（完成済み）

| 領域 | 内容 |
|------|------|
| 比較 | `project_pdf_meta` のローカル PDF 件数 vs `qnap_backup_status=success` 件数 |
| 差分時 | `/storage-settings-v1` に警告表示 + 「QNAPへ再同期」ボタン |
| API | `GET /api/storage/v1/settings/qnap/integrity` / `POST .../integrity/resync` |
| 再同期 | 未成功 PDF を `pending` に戻し Worker / 即時送信 |
| テスト | `server/test/qnap-pdf-backup-v1.test.ts` |

### AI見積エンジン基盤 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 将来 AI 自動見積のマスター・単価・統計土台 |
| 顧客マスター | 区分・標準掛率・値引率・人工単価・出張費 |
| ランク | S/A/B/C — 掛率・粗利率・値引率 |
| 作業/材料 | 標準人工・時間・カテゴリ（防犯/LAN/Wi-Fi/電気/照明/コンセント/インターホン/電話/エアコン/その他） |
| 顧客別単価 | 人工・材料の上書き |
| スマホ UI | `/master-v1` — 連続入力・保存して次へ・⭐ |
| 統計 | `/master-v1?tab=stats` — 原価/売価未設定一覧 |
| Document Center | `GET /api/ai-estimate-engine/v1/document-center/:projectId` |
| API | `/api/ai-estimate-engine/v1/*` + `/api/master/v1/stats` |
| テスト | `server/test/ai-estimate-engine-v1.test.ts` |
| 詳細 | [AI_ESTIMATE_ENGINE_V1.md](./AI_ESTIMATE_ENGINE_V1.md) |

### AI見積エンジン v2（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 現調図面・案件テンプレから見積候補を生成し見積書へ反映 |
| 候補抽出 | 記号/SVG/path/lineType → symbol_mappings → 作業/材料 |
| 配線長 | mmPerPx 仮値 2.0 · 余長 1.2× · 数量切り上げ |
| プレビュー UI | `/master-v1?tab=estimate-preview` — 作業/材料/未設定/警告 |
| 価格 | 顧客上書き → ランク → 標準 → 原価×2 → 警告 |
| 反映 | ドラフト保存 · 見積候補から作成 · 既存見積へ追加 |
| テンプレ | 工事種別=防犯カメラ → 標準作業6件（重複排除） |
| Document Center | source_type 構造（survey_drawing / specification_photo / completion_photo / pdf / project_template） |
| API | `/api/master/v1/estimate-preview` · `/api/ai-estimate-engine/v1/candidates-v2` |
| テスト | `server/test/ai-estimate-engine-v2.test.ts` |
| 詳細 | [AI_ESTIMATE_ENGINE_V2.md](./AI_ESTIMATE_ENGINE_V2.md) |

### 仕様書 / 完了報告書 PDF 自動保存 v1（完成済み）

| トリガー | 動作 |
|----------|------|
| 現調完了（見積へ送る） | 連携済み business 案件があれば `specification-*.pdf` を初回保存 + QNAP キュー |
| 見積PWA 現調連携 | `POST /from-survey` 後に仕様書 PDF 初回保存 |
| 案件詳細「仕様書作成」 | `POST /api/projects/v1/projects/:id/specification/create` |
| 作業完了（construction_done） | `POST /api/work-session/v1/complete` 後に完了報告 PDF 初回保存 |
| 保存先 | `uploads/business/{projectId}/pdfs/` + QNAP `/TiSLY/projects/{id}/specification|completion-report/` |

### IP/設備一覧 v1（完成済み）

| 領域 | 内容 |
|------|------|
| UI | 現調 PWA `/survey-v1` — 機器名/種別/設置場所/IP/ID/メモ（パスワードは管理者のみ） |
| DB | `survey_ip_equipment` |
| PDF | 仕様書表紙「IP一覧」— 未入力は `—`、パスワードは PDF に載せない |
| API | `POST/PATCH/DELETE /api/survey/v1/projects/:id/ip-equipment` |

### Puppeteer PDF Engine（本番）

| 項目 | 内容 |
|------|------|
| 有効化 | VPS `.env` で `TISLY_PDF_PUPPETEER=true` |
| フォールバック | Puppeteer 失敗時は HTML minimal PDF（`renderWithPdfFallback`） |
| health | `GET /api/health` → `pdfEngine: puppeteer` または `html_fallback` |

### TiSLY MotherShip 統合 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 役割 | QNAP TS-464 = **本番サーバーではない** — AI知識庫・案件保管庫・バックアップ母艦 |
| NAS | 書類: nastoms · `192.168.1.134`（見積・請求） / システム: TiSLYNAS · `192.168.1.10` · `\\192.168.1.10\TiSLY` |
| リポジトリ同期 | `scripts/backup-qnap.ps1` — robocopy `/MIR` → `Backups/repo-mirror` |
| 接続診断 | `scripts/qnap-diagnose.ps1` — 接続/書込/読込/速度/空き容量/フォルダ確認 |
| 統合デプロイ | `scripts/deploy-all.ps1` — lint → test → build → commit → push → QNAP → health |
| 案件 ID | `{市コード}-{YY}-{MMDD}-{連番}` — `server/src/projects/project-id-v1.ts` |
| MotherShip パス | `server/src/storage/mothership-paths-v1.ts` |
| 詳細 | [mothership.md](../mothership.md) |
| テスト | `server/test/mothership-paths-v1.test.ts` |
| WebDAV PDF | **既存 v1 を維持** — MotherShip SMB フォルダと並行運用 |

### TiSLY Knowledge Core v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | QNAP を **TiSLY Knowledge（会社の頭脳）** の土台に — AI 検索は未実装 |
| QNAP 構成 | `AI/Standards` … `KnowledgeCards` · `SearchIndex` |
| ローカル | `server/data/knowledge/` |
| カード仕様 | [knowledge-card-spec.md](../knowledge-card-spec.md) |
| 工事カテゴリ | [master/work-categories.json](../../master/work-categories.json) |
| 登録 UI | `/knowledge-v1`（設定メニューから） |
| 検索 API | `GET /api/knowledge/search?q=` — タイトル/タグ/概要（keyword_v1） |
| ロードマップ | [knowledge-roadmap.md](../knowledge-roadmap.md) |
| QNAP 連携案 | [qnap-ai-plan.md](../qnap-ai-plan.md) |
| テスト | `server/test/knowledge-v1.test.ts` |

### Knowledge Acquisition Engine v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **知識が集まる仕組み** — AI 検索の作り込みは次フェーズ |
| Phase1 案件変換 | 案件詳細「Knowledgeへ登録」→ `POST /api/knowledge/from-project/:id` |
| Phase2 写真 | タイトル/タグ/カテゴリ — `POST /api/knowledge/photos/tag` · `?type=photo` 検索 |
| Phase3 PDF | 見積/請求/仕様/完了報告 — `POST /api/knowledge/pdfs/register` · `?type=pdf` 検索 |
| Phase4 3DPrint | MotherShip `3DPrint/` + ローカル `knowledge/3DPrint/{CAD,STL,...}` |
| Phase5 PLC | テンプレ: 自己保持/非常停止/点滅/タイマー/インターロック — `POST /templates/seed` |
| Phase6 RP | RP2350/ESP/配線例/回路図/設定例テンプレ |
| Phase7 QNAP | カード保存 → キュー → `knowledge-qnap-sync` Worker（失敗時リトライ最大3回） |
| Phase8 現場 UI | `/knowledge-quick-v1` — 写真+メモ+保存（30秒目標） |
| テスト | `server/test/knowledge-acquisition-v1.test.ts` |

### Knowledge Automation Engine v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **人間が入力しなくても Knowledge が増える** — Embedding/Qdrant/LLM は未実装 |
| Phase1 案件自動収集 | 案件作成/現調/見積/施工/完了で候補自動生成 · 承認後のみ登録 |
| Phase2 PDF解析 | 見積/請求/仕様/完了報告 — ルールベース（DB+メタ）で機器/材料/備考抽出 |
| Phase3 写真OCR | 盤/ラベル/型番写真 — `rule_based_v1`（将来差し替え可能） |
| Phase4 PLC資産 | `PLC/{Templates,Projects,Libraries,IOMaps,Manuals,Examples}` + ラダー説明文 |
| Phase5 3DPrint資産 | `3DPrint/{Parts,Assemblies,Fixtures,RP2350,PLC,Camera,DINRail,...}` STL/STEP |
| Phase6 Factory資産 | `Factory/{Conveyor,Crusher,Sorter,Tank,Sensor,PLC,HMI,Modbus,Demo}` |
| Phase7 案件ID統合 | `MO-26-0621-001` 形式で候補/資産/Explorer 横断紐付け |
| Phase8 Explorer | `/mothership-explorer-v1` — QNAP · Knowledge · Projects · PLC · 3DPrint · Factory |
| 候補 UI | `/knowledge-candidates-v1` — 一覧 · 承認 · 却下 |
| API | `/api/knowledge/candidates` · `/automation/run/:id` · `/assets` · `/mothership/explorer` |
| フック | `createBusinessProject` · `transitionProjectStatus` で自動候補生成 |
| テスト | `server/test/knowledge-automation-v1.test.ts`（10ケース） |

### Knowledge Sync Stabilization v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | QNAP MotherShip と Knowledge 候補運用の安定化 — AI検索/Embedding/RAG は未実装 |
| Phase1 QNAP同期 | `KnowledgeCards` · `Candidates` · `Assets` · `SearchIndex` を WebDAV/mock へ実ファイル同期 |
| 同期キュー | `qnap-sync-queue.json` — 未接続時ローカル保持 · 再接続時 Worker 自動再送 · 失敗ログ `qnap-sync-failures.json` |
| 同期API | `GET /api/knowledge/qnap-sync/status`（byKind · connection · recentFailures）· `POST .../retry-all` |
| Phase2 候補UI | `/knowledge-candidates-v1` — 複数選択 · 全選択 · 一括承認/却下 · カテゴリ/案件IDフィルター |
| 一括API | `POST /api/knowledge/candidates/bulk/approve` · `POST .../bulk/reject` |
| Phase3 PDF解析 | 見積/請求/仕様/完了報告 — 案件ID · 顧客名 · 物件名 · 工事件名 · 金額 · 部材 · 写真枚数 · 備考 |
| Phase4 OCR準備 | `PhotoOcrEngineV1` interface · `rule_based_v1` · `dummy_v1` · 写真種別（盤/ブレーカ/ラベル/カメラ/NVR） |
| Phase5 Explorer | `/mothership-explorer-v1` — トップフォルダ件数 · 最近更新 · QNAP接続/同期状態 · Knowledge対象表示 |
| テスト | `server/test/knowledge-sync-stabilization-v1.test.ts`（10ケース） |

### Knowledge Search V1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 蓄積 Knowledge を **高速キーワード検索** — Embedding/Qdrant/RAG/Whisper/TTS は未実装 |
| 統合API | `GET /api/knowledge/search-v1` — Cards · Candidates · Projects · PDF · Photos · Assets · PLC · ESP · 3DPrint · Factory |
| スコア | タイトル +10 · タグ +7 · 本文 +5 · 案件ID +6 · 顧客/物件 +4 · カテゴリ +3 |
| フィルタ | カテゴリ · 案件ID · 期間 · 種別（`kinds=`） |
| 検索UI | `/knowledge-search-v1` — 一覧/カード切替 · 一致理由表示 |
| 現場モード | `/knowledge-search-v1?mobile=1` — 大ボタン · 3タップ以内で PDF/写真へ |
| PLC強化 | 自己保持/非常停止/点滅/タイマー/インターロック/順序制御 — ラダー説明 · 用途 · 注意点 |
| 3DPrint | STL/STEP/GCode/部品表 — DINレール · RP2350 · カメラ等をタグ検索 |
| 履歴 | localStorage — 最近検索 · お気に入り · よく使う検索チップ |
| コード | `server/src/knowledge/unified-knowledge-search-v1.ts` · `server/public/knowledge-search-v1.html` |
| テスト | `server/test/knowledge-search-v1.test.ts` |

### Knowledge Field UX V1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **現場 iPhone 向けナレッジ入口** — 3秒で検索開始 · AI/Embedding/RAG/Whisper/TTS は未実装 |
| 現場検索トップ | `/knowledge-field-v1` — 大検索窓 · 検索例 · 種別/カテゴリ · よく使う検索 · 最近検索 |
| 現場メモ検索 | ルールベース単語分解 → キーワード検索（`rule_based_v1`） |
| 検索結果 UI | カード表示 · 一致理由 · 写真/PDF/PLC/3DPrint フラグ · 詳細/PDF/写真/テンプレ/QNAP ボタン |
| 詳細画面 | `/knowledge-detail-v1?id=&kind=` — 概要 · タグ · 案件ID · QNAP · 手順/材料/工具 · 関連ナレッジ |
| よく使う検索 | localStorage `tisly_knowledge_field_favorites_v1` — 追加/長押し削除 |
| 設定連携 | `/settings-v1` → 「ナレッジ検索」「現場ナレッジ」 |
| API | `GET /api/knowledge/detail-v1` · `GET /api/knowledge/field-memo-tokenize` |
| コード | `server/public/knowledge-field-v1.html` · `knowledge-detail-v1.html` · `knowledge-field-shared-v1.js` |
| テスト | `server/test/knowledge-field-v1.test.ts` |

### Knowledge Field UX V2（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **検索結果から PDF/写真/QNAP/関連ナレッジへ素早く辿る** — AI/Embedding/RAG/Whisper/TTS は未実装 |
| Phase1 検索カード | `/knowledge-field-v1` · `/knowledge-search-v1` — PDF/写真/PLC/3DPrint/QNAP/案件フラグ · 詳細/PDF/写真/QNAP/関連ナレッジ/使ったボタン |
| Phase2 詳細 V2 | `/knowledge-detail-v1` — 概要/手順/材料/工具/注意点 · 関連写真/PDF/案件/PLC/3DPrint · QNAP保存パス |
| Phase3 QNAP深リンク | SMB `\\192.168.1.10\TiSLY\...` · File Station URL · パスコピー · `GET /api/knowledge/qnap-links-v1` |
| Phase4 添付カード | `previewUrl` / `fileType` / `sourcePath` / `qnapPath` / `openUrl` — PDF/写真/3DPrint placeholder |
| Phase5 オフラインキャッシュ | localStorage — 最近検索 · お気に入り · 最近開いたKnowledge · 最後の検索結果10件 |
| Phase6 カテゴリ検索 | カテゴリ+キーワード AND · 3件未満で OR fallback（`searchMode: or_fallback`） |
| Phase7 使ったログ | 「✓ 使った」ボタン — `tisly_knowledge_v2_used_log`（knowledgeId/title/usedAt/query/projectId） |
| Phase8 設定導線 | `/settings-v1` — ナレッジ検索 · 現場ナレッジ · MotherShip Explorer · Knowledge Candidates をグループ化 |
| コード | `knowledge-field-ux-v2.js` · `knowledge-qnap-links-v1.ts` · `knowledge-attachments-v1.ts` |
| テスト | `server/test/knowledge-field-v2.test.ts` |

### Knowledge Field UX V3（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **現場で探した資料を見て・使って・すぐ戻れる** — AI/Embedding/Qdrant/RAG/Whisper/TTS は未実装 |
| Phase1 実ファイル配信 | `knowledge-file-delivery-v1.ts` adapter — ローカル/mock 配信 · `GET /api/knowledge/files-v1?path=` |
| Phase2 インライン表示 | 詳細画面 — PDF iframe · 写真 img · STL/STEP/GCode ファイルカード · URLなし時 QNAP/コピー/placeholder |
| Phase3 最近開いた強化 | localStorage 20件 — 最近開いたKnowledge · 最近検索 · お気に入り · 使ったログ · `/knowledge-field-v1` 表示 |
| Phase4 使ったログAPI | `POST /api/knowledge/usage-log` · `server/data/knowledge/usage-log.json` |
| Phase5 使用頻度ランキング | `/knowledge-field-v1` — usage-log + localStorage 集計 · タイトル/回数/最終使用日/カテゴリ |
| Phase6 QNAPコピー改善 | SMB / File Station URL / フォルダパス / ファイル名 — タップでコピー + トースト |
| Phase7 スマホUI | 検索窓 sticky 上部 · 下部固定ナビ · PDF/写真ボタン大型化 · カード余白整理 |
| Phase8 テスト/build | `server/test/knowledge-field-v3.test.ts` |
| コード | `knowledge-field-ux-v3.js` · `knowledge-field-ux-v3.css` · `knowledge-usage-log-v1.ts` |

### Knowledge Field UX V4（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **現場で使いやすい · お客さんに見せやすい · 最近使った資料にすぐ戻れる · QNAP本番接続へ差し替えやすい** — AI/Embedding/Qdrant/RAG/Whisper/TTS は未実装 |
| Phase1 QNAP WebDAV | `knowledge-qnap-delivery-config-v1.ts` · `QNAP_MODE=mock\|webdav` · 設定不足時 mock 自動 fallback · `GET /api/knowledge/delivery-status-v1` |
| Phase2 資料キャッシュ | Cache API · 最大20件 · ON/OFF UI · localStorage `cacheStatus` · キャッシュ済み/未キャッシュ/オフライン表示 |
| Phase3 案件クイックアクセス | `/knowledge-field-v1` — 最近の案件 · projectId · 物件名 · 関連件数 · 最終使用日 · 案件フィルタ · 案件別ログ |
| Phase4 見せるモード | 通常/見せる切替 — QNAP/SMB/File Station/内部パス非表示 · 明るいカードUI · 「この資料を使う」 |
| Phase5 使用ログダッシュボード | `/knowledge-usage-dashboard-v1` · `knowledge-usage-analytics-v1.ts` — ランキング/カテゴリ/案件/最近ログ |
| Phase6 スマホUI | sticky検索修正 · 下部固定バー（戻る/お気に入り/使った） · PDF/写真ボタン大型化 · カード整理 |
| Phase7 テスト | `server/test/knowledge-field-v4.test.ts` |
| 環境変数 | `QNAP_MODE` · `QNAP_WEBDAV_BASE_URL` · `QNAP_FILESTATION_BASE_URL` · `QNAP_SHARE_ROOT` · `QNAP_SMB_ROOT`（`.env.example` 参照） |
| コード | `knowledge-field-ux-v4.js` · `knowledge-field-ux-v4.css` · `knowledge-file-delivery-v1.ts`（WebDAV拡張） |

### Knowledge Field UX V5（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **QNAP本番接続準備 · 現場オフライン運用 · 見せるモード安全強化** — AI/Embedding/Qdrant/RAG/Whisper/TTS は未実装 |
| Phase1 QNAP接続テスト | `GET /api/knowledge/qnap-connection-test` — mode/configured/reachable/fallbackReason/sampleListResult（認証情報は返さない） |
| Phase2 Service Worker | `sw-knowledge-field-v5.js` — files-v1/detail-v1/search-v1/project-access stale-while-revalidate · 最大20件 · キャッシュON/OFF |
| Phase3 オフライン現場モード | `/knowledge-field-v1` — キャッシュ済み資料一覧 · 最終更新 · 容量目安 · 削除/全更新 · オンライン復帰で通常表示 |
| Phase4 見せるモード強化 | QNAP/SMB/WebDAV/API URL/projectId/userId/usage-log詳細/mock表示を非表示 · 資料名/PDF/写真/説明/カテゴリ/関連資料のみ |
| Phase5 お客様向け説明 | `knowledge-customer-explanation-v1.ts` — 詳細画面カード（mock_v1 · 将来AI差し替え可能） |
| Phase6 案件ワンタップ | 案件カード → `GET /api/knowledge/project-access-v1/:id/knowledge` · 使用順 · PDF/写真バッジ · 案件別ログ |
| Phase7 使用ログ改善 | 期間/カテゴリ/案件フィルタ · CSV export · TOP10 · 未使用資料 · JSON件数 |
| Phase8 テスト | `server/test/knowledge-field-v5.test.ts` |
| 確認 | `GET /api/knowledge/qnap-connection-test` · `/knowledge-field-v1` · `/knowledge-usage-dashboard-v1` |
| コード | `knowledge-field-ux-v5.js` · `knowledge-field-ux-v5.css` · `sw-knowledge-field-v5.js` · `knowledge-qnap-connection-test-v1.ts` |

**VPS QNAP WebDAV 本番接続:** `.env` に `QNAP_MODE=webdav` + WebDAV URL/認証を設定後、`GET /api/knowledge/qnap-connection-test` で `reachable:true` を確認。

### Knowledge Customer UI V1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **お客さんに見せる専用ナレッジ UI** — 営業・現調・施工説明・引き渡し向け · AI/Embedding/Qdrant/RAG/Whisper/TTS は未実装 |
| Phase1 ホーム | `/knowledge-customer-v1` — TiSLY Knowledge · 大検索窓 · 8カテゴリカード · 最近使った資料 |
| Phase2 詳細 | `/knowledge-customer-detail-v1?id=&kind=` — 写真優先 · 説明 · Before/After · 良くなること · 注意点 · PDF · 関連資料 |
| Phase3 説明データ | `knowledge-customer-explanation-v1.ts` — headline/simpleDescription/customerBenefits/customerWarnings/afterWorkCheckpoints/recommendedFor/relatedQuestions（mock_v1） |
| Phase4 写真中心 | 複数写真は横スクロール · なしは placeholder · PDFは写真の下 · 3DPrintは「部品資料」 |
| Phase5 Site Map | `knowledge-customer-site-map-v1.ts` — 玄関/外周/分電盤/工場ライン/制御盤（mock · 将来図面連動） |
| Phase6 導線 | 現場 `/knowledge-field-v1` · `/knowledge-detail-v1` から「お客様向けで見る」→ Customer Detail · Customer Detail から現場詳細へ戻る |
| Phase7 スマホ | 明るい背景 · 白カード · 44px+ボタン · 下部固定ナビ · 大きい文字/余白 |
| Phase8 テスト | `server/test/knowledge-customer-v1.test.ts`（12ケース） |
| API | `GET /api/knowledge/customer-home-v1` · `customer-detail-v1` · `customer-search-v1` |
| 非表示 | QNAP/SMB/WebDAV/API URL表示 · projectId · userId · usage-log詳細 · mock/debug |
| コード | `knowledge-customer-v1.html/js/css` · `knowledge-customer-detail-v1.html/js` · `knowledge-customer-home-v1.ts` · `knowledge-customer-detail-v1.ts` |

### Knowledge Customer UI V2（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **案件単位でお客さんに見せる** — 営業デモ · 現調説明 · 引き渡し説明 · Site Map連動 · AI/Embedding/Qdrant/RAG/Whisper/TTS は未実装 |
| Phase1 案件別ページ | `/knowledge-customer-project-v1?ref=` — 物件名 · 工事ジャンル · 説明 · できること · 関連ナレッジ/写真/PDF · Site Map/資料一覧導線 |
| Phase2 Site Map | `/knowledge-customer-site-map-v1?ref=` — 2Dカード型マップ · エリアタップで関連資料/説明/ナレッジ |
| Phase3 連動データ | `knowledge-customer-site-map-v1.ts` — areaId · relatedKnowledgeIds · customerExplanation · statusLabel（mock · 将来3D/LiDAR連動） |
| Phase4 資料一覧 | 案件ページ — 写真→動画placeholder→説明→PDF→部品→ナレッジ · 絞り込み（写真/PDF/防犯/電気/工場/ネットワーク） |
| Phase5 Before/After | Customer Detail — beforePoints/afterPoints 強化 |
| Phase6 導線 | V2 Home → 案件 → Site Map → Detail → 案件/現場詳細へ戻る · V1 は維持 |
| Phase7 スマホUI | 下部4タブナビ · 大カード · 44px+ボタン · 写真優先 |
| Phase8 テスト | `server/test/knowledge-customer-v2.test.ts`（18ケース） |
| mock案件 | `DEMO-HOME-001`（戸建て防犯） · `DEMO-FACTORY-001`（工場） · `DEMO-NETWORK-001`（ネットワーク） |
| API | `customer-home-v2` · `customer-project-v1` · `customer-site-map-v1` · `customer-materials-v1` |
| 非表示 | QNAP/SMB/WebDAV/API URL · projectId生表示 · usage-log詳細 · mock/debug |
| コード | `knowledge-customer-v2.html/js/css` · `knowledge-customer-project-v1.*` · `knowledge-customer-site-map-v1.*` · `knowledge-customer-project-v1.ts` · `knowledge-customer-home-v2.ts` |

### Knowledge Customer UI V3（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **実案件IDに近い Customer ページ** — 営業・現調・引き渡しで写真/PDF/配置図を説明 · AI/Embedding/Qdrant/RAG/Whisper/TTS は未実装 |
| Phase1 本番 ref | `MO-26-0709` / `MO-26-0709-01` / `JY-26-0711` 等 · DEMO ref 継続 · 不明 ref は fallback |
| Phase2 メタ adapter | `knowledge-customer-project-adapter-v1.ts` — displayName/city/workType/areas/relatedIds |
| Phase3 ファイル adapter | `knowledge-customer-project-files-v1.ts` — 現調/施工前後写真 · 仕様/完了/見積/請求 PDF · 部品資料 |
| Phase4 現場写真 | 案件ページ — 施工前/中/後/メモ · 大カード · タップ拡大モーダル · placeholder |
| Phase5 PDF資料 | 案件ページ — 仕様/完了/見積/請求/取説/部品 · 写真より下 · 「PDFを見る」「資料を確認する」 |
| Phase6 Site Map連動 | エリア詳細 — 関連写真/PDF/ナレッジ · Before/After · 注意点 |
| Phase7 安全表示 | ref は URL のみ · 生 ID 非強調 · 404 ではなく「資料を準備中です」 |
| Phase8 スマホUI | 5タブ下部ナビ · 大写真/PDFボタン · 押しやすいエリアカード |
| Phase9 テスト | `server/test/knowledge-customer-v3.test.ts`（20ケース） |
| API | `customer-project-v1` · `customer-site-map-v1/area` · `customer-project-file-v1` |
| 本番例 | `/knowledge-customer-project-v1?ref=MO-26-0709` |
| 非表示 | QNAP/SMB/WebDAV/project-storage パス · projectId 生表示 · mock/debug |
| コード | `knowledge-customer-v3.css` · adapter/files · project/site-map JS 更新 |

### Knowledge Customer UI V4（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **PWA案件DBとCustomer UIをつなぐ準備** · refベースPDF閲覧 · お客様共有read-only · AI/Embedding/Qdrant/RAG/Whisper/TTS は未実装 |
| Phase1 PWA adapter | `knowledge-business-projects-adapter-v1.ts` — business_projects → Customer meta · 無い時V3 mock fallback |
| Phase2 案件一覧 | `/knowledge-customer-projects-v1` — 最近の案件 · 検索 · 絞り込み（防犯/電気/工場/ネットワーク/完了/準備中） |
| Phase3 PDF閲覧 | `/knowledge-customer-document-v1?ref=&fileId=` — ref+fileId · 閲覧優先 · 準備中メッセージ |
| Phase4 共有read-only | `view=share` — 現場/管理者リンク非表示 · 下部ナビ「資料を確認する/閉じる」 |
| Phase5 共有フィルタ | `knowledge-customer-share-filter-v1.ts` — 請求書/内部メモ/QNAP/project-storage非表示 |
| Phase6 Site Map 3D準備 | `mapAsset` — mapType/lidar/floorplan/threeD · cameraPositions · areaPolygons（mock） |
| Phase7 スマホUI | `knowledge-customer-v4.css` — 案件カード · 大PDFボタン · 共有ナビ |
| Phase8 テスト | `server/test/knowledge-customer-v4.test.ts`（18ケース） |
| API | `customer-projects-v1` · `customer-document-v1` · share view on project/site-map |
| 非表示 | QNAP/SMB/WebDAV/project-storage · projectId生表示 · share時請求書 · API URL（share payload） |
| コード | `knowledge-business-projects-adapter-v1.ts` · `knowledge-customer-share-filter-v1.ts` · `knowledge-customer-document-v1.ts` · `knowledge-customer-projects-v1.*` |

### TiSLY Monitoring 3D Dashboard UI V1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **発報場所が一瞬でわかる 3D俯瞰監視 UI** — 疑似3D/CSS · Three.js は次フェーズ |
| 画面 | `/tisly-monitoring-3d-v1` · `/tisly-monitoring-home-v1` · `/tisly-monitoring-plant-v1` |
| フロア | 外周 · 1階 · 2階 · 屋根（任意）— 縦スクロール · サイドジャンプ |
| 発報フォーカス | alert/warning で該当 floor scrollIntoView · ピン赤点滅 · フロア枠発光 · 右上バナー |
| 文字説明 | 発報種別 · フロア · 場所 · 機器 · 時刻 · 対応ボタン |
| ログ | 最新/アラーム/情報/対応済み · カード/テーブル切替 · UNKNOWN→未登録機器 |
| 配置データ | `tisly-monitoring-layout-v1.ts` · `tisly-monitoring-layout-v1.js` |
| ライブカメラ | 右パネル placeholder · linkedCameraId 自動選択 · LIVE バッジ |
| 通知統合 | `events` + `notification_logs` 正規化 · level 日本語化 |
| 表示モード | PC（左ナビ/中央マップ/右カメラ/下ログ）· スマホ（下部ナビ）· TV（`?mode=tv`） |
| Customer連動 | 設備説明 · 関連資料 · 案件ページリンク準備 |
| API | `GET /api/monitoring/v1/dashboard` · `/logs` · `POST /ack/:id` · `/test-alert` |
| テスト | `server/test/tisly-monitoring-3d-v1.test.ts` |

### TiSLY Monitoring UI V2 Visual Upgrade（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **営業デモで感動する Security Command Center** — 機能追加より UI/UX 品質優先 |
| Phase1 3Dマップ | 建物影 · 立体感 · 発光 · ガラス · 外周フェンス · 庭 · 駐車場 · 玄関 · 勝手口 · 1F/2F間取り |
| Phase2 発報演出 | フロア拡大 · 赤リング波紋 · 上部アラートバー（🚨 侵入警報 / 場所 / 時刻） |
| Phase3 右パネル | 現在警報 · ライブカメラ · センサー状態 · 警戒状態 · 最終検知 · オンライン機器 |
| Phase4 ログ | 防災センター風テーブル · 優先度色分け（侵入/警報/注意/情報） |
| Phase5 カメラ | 発報連動モック · スキャンライン · 赤枠 · 地点ラベル |
| Phase6 TV | `?mode=tv` — 大文字 · 大マップ · 警報最優先 · ログ右下固定 |
| Phase7 UI標準 | [docs/ui-concept/MONITORING_UI_GUIDE.md](../ui-concept/MONITORING_UI_GUIDE.md) |
| レイアウト追加 | 勝手口ドア/カメラ（`door-back-01` · `cam-back-01`） |
| テスト | `server/test/tisly-monitoring-3d-v1.test.ts`（V2 CSS/JS アサーション追加） |

### TiSLY Monitoring 3D Dashboard V3（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **未来の TiSLY 監視センター** — LiDAR · Three.js · 案件データ統合基盤 |
| 画面 | `/monitoring-3d-v2` · エイリアス `/tisly-monitoring-3d-v3` |
| Phase1 Three.js | OrbitControls — 回転 · ズーム · パン · 自動アニメーション |
| Phase2 階層 | 外周 · 1F · 2F レイヤー — 全表示/外周のみ/1F/2F 切替 |
| Phase3 センサー | frontGate · frontDoor · living · stairs · balcony · garage — normal/warning/alert |
| Phase4 発報 | 赤点滅 · 波紋 · カメラ移動 · アラートカード自動表示 |
| Phase5 カメラ | cameraId 連携 · クリックで右パネルモック LIVE 表示 |
| Phase6 LiDAR | `mapAsset` — type · floorLevel · position · rotation · scale（Polycam/Scaniverse/RoomPlan 受け皿） |
| Phase7 Customer | `relatedKnowledgeIds` · センサークリック → Knowledge Customer 資料 |
| Phase8 TV | `?mode=tv` — 全画面赤警報 · 対象拡大 · 30秒固定 |
| Phase9 デモ | 侵入 · 火災 · 設備異常 — 営業デモ自動再生ボタン |
| API | `GET /api/monitoring/v1/3d-scene` · `/3d-sensor/:id` |
| コード | `monitoring-3d-v2/` · `tisly-monitoring-3d-v3.ts` · `tisly-monitoring-map-asset-v1.ts` |
| テスト | `server/test/tisly-monitoring-3d-v3.test.ts` |

### TiSLY Monitoring 3D Dashboard V3.1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **現調スキャンデータ受け入れ入口** — Polycam/RoomPlan/Scaniverse の GLB/JSON/USDZ 将来読込準備 |
| Phase1 upload API | `POST /api/monitoring/v1/map-assets` → `server/data/monitoring/map-assets.json` |
| Phase2 list API | `GET /api/monitoring/v1/map-assets?siteId=` — assets · activeAsset · fallback · uploadGuide |
| Phase3 Manager UI | `/monitoring-map-assets-v1` — 一覧 · アップロード · transform · active 切替 |
| Phase4 Three.js | `/monitoring-3d-v2` — 登録 mapAsset placeholder mesh（sourceType 色 · ラベル） |
| Phase5 calibration | transform position/rotation/scale/heightOffset — 保存 · リセット · プレビュー |
| Phase6 センサー再配置 | 座標入力 + プレビュー → `device-layout-overrides.json` |
| Phase7 Customer | `relatedKnowledgeIds` · Customer Detail · Site Map · PDF リンク維持 |
| Phase8 ドキュメント | [MAP_ASSET_GUIDE.md](../monitoring/MAP_ASSET_GUIDE.md) · MONITORING_UI_GUIDE 追記 |
| Phase9 テスト | `server/test/tisly-monitoring-3d-v31.test.ts` |
| API | `PATCH /map-assets/:id` · `GET/POST /device-layout-overrides` |
| コード | `monitoring-map-assets-store-v1.ts` · `monitoring-device-layout-overrides-store-v1.ts` · `monitoring-map-assets-v1/` |

### TiSLY Monitoring 3D Dashboard V3.2（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **実3Dファイルを監視画面に載せる入口** — GLB/GLTF アップロード · GLTFLoader 表示 |
| Phase1 upload API | `POST /api/monitoring/v1/map-assets/upload` — fileBase64 · 許可拡張子 · サイズ上限 |
| Phase2 static | `/uploads/monitoring/{siteId}/{safeFileName}` — express.static 配信 |
| Phase3 GLTFLoader | `/monitoring-3d-v2` — activeAsset が glb/gltf なら mesh 読込 · 失敗時 placeholder |
| Phase4 fallback | OBJ/PLY/USDZ — 登録可 · 3D は placeholder + メッセージ |
| Phase5 Manager UI | ファイル選択 · 進行表示 · トースト · fileType バッジ · fileSize |
| Phase6 プレビュー | Manager 内 — GLB 簡易3D · 画像 img · 未対応 placeholder |
| Phase7 QNAP adapter | `monitoring-map-asset-storage-adapter-v1.ts` — local / qnap-webdav(TODO) / mock |
| Phase8 セキュリティ | sanitize · MIME · 絶対パス非公開 · stack trace 非公開 |
| Phase9 ドキュメント | MAP_ASSET_GUIDE V3.2 · MONITORING_UI_GUIDE 追記 |
| Phase10 テスト | `server/test/tisly-monitoring-3d-v32.test.ts` |
| コード | `monitoring-map-asset-upload-v1.ts` · `monitoring-map-asset-storage-adapter-v1.ts` |
| uiVersion | `v3.2` |

### TiSLY Monitoring 3D Dashboard V3.3（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **複数3Dスキャンを現場運用に近い形で表示** — OBJ/PLY · 複数フロア · センサー合わせ |
| Phase1 OBJLoader | Scaniverse `.obj` — transform · 読込中表示 · fallback · material なし対応 |
| Phase2 PLYLoader | `.ply` — mesh/点群 · transform · fallback |
| Phase3 USDZ | 登録継続 · Dashboard「プレビュー準備中」· GLB 変換案内 |
| Phase4 複数mapAsset | activeのみ / 全フロア合成 / 外周/1F/2F · floorHeightOffsets · visibleInDashboard |
| Phase5 センサー合わせ | 編集モード · X/Y/Z ± · device-layout-overrides 永続化 |
| Phase6 工場seed | `DEMO-FACTORY-001` — サイロ/コンベア/ミキサー/水タンク/出荷ゲート/操作室 |
| Phase7 Manager | floorLevel タブ · 削除 API · transform 一括リセット · OBJ/PLY バッジ |
| Phase8 QNAP adapter | `saveLocalAsset` · `saveQnapAssetMock` · `getBackupStatus` |
| Phase9 ドキュメント | MAP_ASSET_GUIDE · MONITORING_UI_GUIDE · PROJECT_STATUS |
| Phase10 テスト | `server/test/tisly-monitoring-3d-v33.test.ts` |
| uiVersion | `v3.3` |

### TiSLY Monitoring 3D Dashboard V3.4（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **3D監視を現調写真 · PDF · Customer UI の入口に** — 設備クリックで資料へ |
| Phase0 PWAルート | `/estimate` · `/invoice` · `/drawing-editor` は 404 — `/route-map` で一覧 · 正: `/estimate-v1` · `/survey-drawing-v1` |
| Phase1 attachment | `monitoring-device-attachments-v1.ts` · `device-attachments.json` — 12 type · customerVisible/reportVisible |
| Phase2 API | `GET/POST/DELETE /device-attachments` — sanitize · source 非公開 · mock seed |
| Phase3 資料タブ | 右パネル 状態/カメラ/**資料**/ログ — 写真/PDF/Customer/完了報告ボタン |
| Phase4 完了報告スロット | `report-photo-slots.json` — 最大6枚 · reportVisible 写真のみ |
| Phase5 Customer | 案件ページ · Site Map · お客様向け説明 · 関連資料リンク強化 |
| Phase6 写真ピン | 3D上 📷 — 青/緑/灰 · クリックで資料タブ |
| Phase7 工場 | DEMO-FACTORY-001 attachment seed — サイロ/ミキサー/コンベア/出荷ゲート等 |
| Phase8 docs | DEVICE_ATTACHMENT_GUIDE · MONITORING_UI_GUIDE · MAP_ASSET_GUIDE · PROJECT_STATUS |
| Phase9 テスト | `server/test/tisly-monitoring-3d-v34.test.ts` |
| uiVersion | `v3.4` |
| 確認 | `/monitoring-3d-v2?siteId=DEMO-HOME-001` · `/api/monitoring/v1/device-attachments?siteId=DEMO-HOME-001&deviceId=frontDoor` |

### 実運用フェーズ1 Phase10–15（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **実案件1件を完走できる** — 案件作成→現調→図面→見積→請求→完了報告→案件完了 |
| Phase10 案件詳細 | `/project-mgmt-detail-v1?projectId=` — 案件名/顧客/住所/電話/担当 · 7段階ステータス · 8段階進捗バー |
| Phase11 タイムライン | `project_timeline_events` — 案件作成/現調/見積送付等を時系列表示（履歴タブ） |
| Phase12 画面遷移 | 現調/図面/見積/請求/完了報告 — `projectId` + `return` 引継ぎ · 戻るで案件詳細へ |
| Phase13 ダッシュボード | `/project-dashboard-v1` — 進行中/見積待ち/請求待ち/未完了/今週売上/今月売上/粗利（仮） |
| Phase14 route-health | `/route-health` — projects · survey · estimate · invoice · completion 件数監視 |
| Phase15 シミュレーション | `server/scripts/operational-phase1-simulation.mjs` — 守谷市テスト案件自動生成・全画面検証 |
| 案件センター | `/projects-v1` — business 案件タップで案件詳細へ |
| API | `GET /api/dashboard-v1/operational-kpi` · `operational` in project-mgmt detail |
| コード | `operational-status-v1.ts` · `operational-href-v1.ts` · `tisly-return-nav-v1.js` |
| テスト | `server/test/operational-phase1-v1.test.ts`（7ケース） |
| 確認 | `/project-dashboard-v1` · `/project-mgmt-detail-v1` · `/route-health` |

### 実案件完走 Phase16（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **実案件フロー1件完走** — 手動ではなく各保存操作でステータス自動更新 · 不足一覧 · 粗利 · PDFセンター |
| Phase16-1 ステータス自動化 | 現調保存→現調中 · 見積作成→見積提出 · 請求作成→請求済 · 完了報告保存→完了 — 案件一覧即反映 |
| Phase16-2 不足一覧 | 案件詳細 — □現調/図面/見積/請求/完了報告 · 完成で自動チェック |
| Phase16-3 案件利益 | 見積金額/請求金額/材料費/粗利/粗利率（仮計算可） |
| Phase16-4 PDFセンター | 見積/請求/仕様書/完了報告 PDF 一覧 · ワンタップ `/document-viewer-v1` |
| Phase16-5 実案件テスト | `server/scripts/operational-phase16-simulation.mjs` — 守谷市テスト案件フルフロー整合確認 |
| API | `checklist` · `profit` · `pdfCenter` in `GET /api/project-mgmt/v1/projects/:id` |
| フック | `project-status-auto-v1.ts` — survey/estimate/invoice/completion 保存時 |
| コード | `operational-checklist-v1.ts` · `project-profit-v1.ts` · `project-pdf-center-v1.ts` |
| テスト | `server/test/operational-phase16-v1.test.ts`（8ケース） |
| 確認 | `/project-mgmt-detail-v1?projectId=` · `/route-health` · https://tisly.jp/api/health |

### 実運用 Phase17 — PDF・図面・URL安定化（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **PDF/図面/URL事故の再発防止** — LINE送信廃止 · 戻る統一 · 帳票アンダーライン · 方眼紙全面描画 · SW更新 |
| PDF UI | `document-viewer-v1` — 「PDFにする」「保存」のみ（LINEで送る削除） |
| 戻る | `return` / `returnUrl` 優先 · 無ければ `/document-center-v1?projectId=` |
| 帳票 | 見積/請求 右上メタ欄アンダーライン（画面 + `toms-excel-doc-layout-v2`） |
| 図面 | `syncGridStageSize` — 方眼紙白エリア全面を描画領域に |
| 旧URL | `/estimate` `/invoice` `/drawing-editor` `/survey` `/projects` `/materials` `/materials-v1` `/purchase` → 301 |
| URL契約 | [docs/routes/ROUTE_CONTRACT.md](../routes/ROUTE_CONTRACT.md) |
| route-health | Phase17 診断 · Commit/SW/Cache · 更新ボタン常設 |
| SW | `tisly-pwa-v2400-phase17` · activate時古cache削除 |
| テスト | `server/test/operational-phase17-v1.test.ts` |
| 確認 | `/route-health` · `/document-center-v1` · https://tisly.jp/api/health |

### 実運用 Phase18 — /customer 分離 · RN流用準備（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **PWA資産を壊さず整理** — /app と /customer 完全分離 · React Native 流用の shared モジュール |
| Phase18-1 URL契約 | `server/src/shared/routes/tisly-routes-v1.ts` — 社内/お客様/旧URL一覧 |
| Phase18-2 /customer | `/customer` PWA入口 · project/document/monitoring · 内部情報非表示 |
| Phase18-3 shared | `server/src/shared/{routes,business,pdf,customer,project,navigation,ui-models}/` |
| Phase18-4 PDF戻る | document-center 優先 · history.back 不使用 |
| Phase18-5 帳票 | 右上メタ欄アンダーライン · 株式会社TOMS · 口座名義トムズ |
| Phase18-6 図面 | `syncGridStageSize` + `getBoundingClientRect` 座標正規化 |
| Phase18-7 テスト | `server/test/operational-phase18-v1.test.ts` |
| Phase18-8 route-health | Phase18 分離診断 · route契約API · iPhone customer リンク |
| SW | `tisly-pwa-v2400-phase18` |
| PWA start_url | `https://tisly.jp/customer` |
| 旧PRO Remote | `/customer/:code/portal`（レガシー） |
| API | `/api/customer-portal/v1/*` |
| 確認 | `/customer` · `/route-health` · https://tisly.jp/api/health |

### 実運用 Phase19 — お客様UI全面整理（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **一般のお客様が説明なしで使える /customer UI** — 開発者向け情報を完全非表示 |
| Phase19-1 ホーム | `/customer` — 物件名 · システム状態 · 最終確認 · 6大カードボタン |
| Phase19-2 監視 | `/customer/monitoring/:shareId` — フロア別センサー · 発報赤バナー · 点滅スクロール（iframe廃止） |
| Phase19-3 案件 | `/customer/project/:shareId` — 見積/請求/仕様/完了/写真/点検のみ |
| Phase19-4 書類 | `/customer/document/:shareId` — 戻る/PDFにする/保存 · customerReturnUrl |
| Phase19-5 shared | `customer-labels-v1` · `customer-home-state-v1` · `customer-monitoring-state-v1` · `customer-project-files-filter-v1` |
| Phase19-6 禁止語 | DOM/API から MQTT/QNAP/mock/API/debug 等を排除 |
| Phase19-7 route-health | Phase19 分離診断 · 禁止語 · start_url · 全サブルート200 |
| Phase19-8 テスト | `server/test/customer-portal-v1.test.ts` |
| SW | `tisly-pwa-v2400-phase19` |
| PWA | `manifest-customer-v1.webmanifest` — `start_url: /customer` |
| 確認 | `/customer` · `/route-health` · https://tisly.jp/api/health |

### 実運用 Phase20 — お客様UI実運用磨き込み（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **説明不要のお客様向け UI** — 資料ページ · 見守り · 物件一覧 · iPhone Safari 可読性 |
| Phase20-1 ホーム | `/customer` — 現在の状態 · 最終確認 · 6大カードのみ（デモ切替非表示） |
| Phase20-2 資料 | `/customer/project/:shareId` — 書類一覧 · 写真 · 点検記録（社内情報非表示） |
| Phase20-3 PDF | `/customer/document/:shareId` — 戻る先固定 `/customer/project/:shareId` · LINE非表示 |
| Phase20-4 見守り | `/customer/monitoring/:shareId` — センサー状態 · 最終検知 · 技術語API非返却 |
| Phase20-5 物件一覧 | `/customer/TOMS001` — 書類/見守り/連絡の大ボタンカード |
| Phase20-6 shared | `customer-property-list-v1` · `customer-document-nav-v1` · ラベル定数集約 |
| Phase20-7 route-health | Phase20 診断 · TOMS001 200 · 資料戻る先 · 禁止語 |
| Phase20-8 テスト | `customer-portal-v1.test.ts` Phase20 ブロック |
| SW | `tisly-pwa-v2400-phase20` |
| 確認 | `/customer` · `/customer/TOMS001` · `/route-health` · https://tisly.jp/api/health |

### 実運用 Phase21 — お客様UI最終版（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **iPhone Safari 実機確認を踏まえた最終版** — 白基調カードUI · React Native 流用構造維持 |
| Phase21-1 ホーム | `/customer` — 物件名 · 現在の状態 · 最終確認 · 6大カードのみ |
| Phase21-2 物件一覧 | `/customer/TOMS001` — タップ誘導 · 大ボタン · トムズへ連絡 |
| Phase21-3 資料 | `/customer/project/:shareId` — 工事写真 · 書類 · 見守り · 連絡 |
| Phase21-4 PDF | `/customer/document/:shareId` — 戻る/PDF/保存のみ · project固定戻り |
| Phase21-5 見守り | `/customer/monitoring/:shareId` — フロア別 · 警報履歴 · 連絡ボタン |
| Phase21-6 デザイン | 白〜薄グレー · 太字 · safe-area · 黒ベース廃止 |
| Phase21-7 shared | `customer-project-actions-v1` · ラベル集約 · DOM/ロジック分離 |
| Phase21-8 route-health | Phase21 診断 · SW v2401-phase21 |
| Phase21-9 テスト | `customer-portal-v1.test.ts` · `operational-phase21-v1.test.ts` |
| SW | `tisly-pwa-v2401-phase21` |
| 確認 | `/customer` · `/customer/TOMS001` · `/route-health` · https://tisly.jp/api/health |

### 実運用 Phase23 — 案件マスター統合（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **デモ画面ではなく実案件登録→顧客渡し可能** — Customer/Property Master から /customer 自動生成 |
| Phase23-1 Customer Master | `customer-master-v1.ts` · `customer_portal_master` — customerCode/customerName/address/contactName/contactPhone/plan/status |
| Phase23-2 Property Master | `customer-property-master-v1.ts` · `customer_portal_properties` — propertyId/customerCode/propertyName/address/installedDate/nextInspectionDate |
| Phase23-3 ホーム自動生成 | `/customer` · `/customer/:code` — マスターから物件一覧 · HTML固定廃止 |
| Phase23-4 資料自動生成 | `/customer/project/:shareId` — business PDF + `/customer-files/` から取得 · mock 廃止 |
| Phase23-5 PDF統一 | `customer-files-v1.ts` · `/customer-files/{code}/{ref}/{docType}/` — estimate/invoice/specification/completion/inspection |
| Phase23-6 連絡ボタン | 電話/メール/問い合わせフォーム · `customer_contact_settings` ON/OFF |
| Phase23-7 RN準備 | `customer-data-service-v1.ts` — データ取得集約 · UI/データ分離 |
| Phase23-8 route-health | Phase23 診断 · master/property/document 件数 · customer api status |
| Phase23-9 テスト | `customer-portal-v1.test.ts` · `operational-phase23-v1.test.ts` |
| API | `GET /api/customer-portal/v1/stats` · `/file/:shareId/:fileId` |
| SW | `tisly-pwa-v2405-phase25` |
| JS | `customer-v1-phase25` |
| 確認 | `/customer` · `/customer/TOMS001` · `/route-health` · https://tisly.jp/api/health |

### 実運用 Phase24-25 — customer実運用完成（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **customer側PDF復旧 · TOMS表記統一 · 文字化け修正 · Customer Master管理** |
| Phase24-1 TOMS表記 | 「トムズ」→「TOMS」（振込口座名義「トムズ」は例外維持） |
| Phase24-2 管理画面 | `/customer-admin-v1` — Customer/Property一覧 · URLコピー（社内専用） |
| Phase25-1 PDF | `/customer/document/:shareId?docType=` · demo PDF自動生成 · file API stream error処理 |
| Phase25-2 500防止 | customer側 Internal Server Error 非表示 · 「書類を準備中です」メッセージ |
| Phase25-3 文字化け | `sanitizeSharePayloadTextV1` + Property Master sanitize · Phase24 migration |
| Phase25-4 route-health | Phase24-25 診断 · TOMS残存 · PDF200 · 禁止語 · 文字化け |
| API | `GET /api/customer-portal/v1/admin/list` |
| SW | `tisly-pwa-v2405-phase25` |
| テスト | `operational-phase24-v1.test.ts` · `operational-phase25-v1.test.ts` |
| 確認 | `/customer/document/:shareId?docType=estimate` · `/customer-admin-v1` · `/route-health` |

### AI画像見積解析 v1（完成済み — mock Vision）

| 領域 | 内容 |
|------|------|
| 目的 | LINEトーク履歴スクショから品名・数量を読み取り、見積明細へ **末尾追記** |
| UI | `/estimate-v1` 詳細 — 「📷 写真で見積もり作成」高コントラスト大ボタン（暗所・屋外向け） |
| 入力 | カメラ起動 / ギャラリー選択（既存明細は上書きしない） |
| Parser | `line-image-parse-v1.ts` — rule_based + mock_vision（デモ OCR 文） |
| 抽出例 | ポールライト用ベース加工 1台 · 防犯カメラ 3台 · VVF 41m · 取付ボックス 3個 |
| 計算 | 追記後 `recalcLocal` で小計・税・税込合計を即時更新 |
| API | `POST /api/estimate/v1/parse-line-image` |
| テスト | `server/test/line-image-parse-v1.test.ts` |
| 写真分離 | 変更なし（現調/完了報告書写真とは無関係） |

### AI画像見積解析 v1.1（完成済み — Gemini Vision 本番）

| 領域 | 内容 |
|------|------|
| 目的 | **固定デモ明細を廃止**し、実画像 OCR から見積明細化 |
| 変更方針 | 既存ナレッジ・見積・モックデータは初期化せず、解析経路のみ差し替え |
| Vision | `line-image-gemini-vision-v1.ts` — `GEMINI_API_KEY` + Gemini Flash |
| Parser | `line-image-parse-v1.ts` — 円表記（`105,000円` / `×3台`）+ 構造化 JSON |
| 抽出例 | `1F リビング 200V 4.0kw 105,000円` · `FY-6V 14,000円 ×3台` · `施工費 20,000円` |
| 廃止 | ポールライト / VVF 固定デモ返却 · `[LINE画像解析]` 品名タグ |
| UI | `estimate-ui-v18` — タイムアウト 60s · メモタグ非付与 |
| API | `POST /api/estimate/v1/parse-line-image`（async · imageBase64） |
| ENV | `GEMINI_API_KEY` / `GEMINI_ESTIMATE_LINE_MODEL`（任意） |
| テスト | `server/test/line-image-parse-v1.test.ts` |
| 写真分離 | 変更なし（現調/完了報告書写真とは無関係） |

### 実運用 Phase22 — お客様UI iPhone Safari 最終確認（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **本番 iPhone Safari でお客様UI最終確認** — 見た目 · 文言 · 導線 · 古いキャッシュ対策 |
| Phase22-1 ホーム | `/customer` — 白〜薄グレー · カード視認性 · 社内語非表示 |
| Phase22-2 物件一覧 | `/customer/TOMS001` — 物件名 · 現在の状態 · 最終確認 · 3大ボタン |
| Phase22-3 資料 | `/customer/project/:shareId` — 工事写真 · 書類一覧 · 点検記録 · 下部バー |
| Phase22-4 PDF | `/customer/document/:shareId` — 戻る/PDF/保存 · LINE非表示 · project固定戻り |
| Phase22-5 見守り | `/customer/monitoring/:shareId` — 外周/1階/2階 · 最終確認 · 技術語非表示 |
| Phase22-6 キャッシュ | SW v2402-phase22 · network-first · 更新バナー · cache clear |
| Phase22-7 shared | `customer-cache-v1` · `customer-document-actions-v1` · ラベル集約 |
| Phase22-8 route-health | Phase22 診断 · SW/JS version 表示 |
| Phase22-9 テスト | `customer-portal-v1.test.ts` · `operational-phase22-v1.test.ts` |
| SW | `tisly-pwa-v2402-phase22` |
| JS | `customer-v1-phase22` |
| 確認 | `/customer` · `/customer/TOMS001` · `/route-health` · https://tisly.jp/api/health |

### オフライン完全対応 + 音声入力 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **電波障害でも見積・ナレッジ・現調が止まらない** · ハンズフリー音声メモ |
| SW | `tisly-pwa-v2419-offline-voice` — シェル/現場アセット Cache + Background Sync |
| IndexedDB | `tisly_offline_core_v1` — `sync_queue` · `snapshots`（既存データは削除しない） |
| 接続表示 | 実務ナビ上部 — `📡 オンライン` / `⚠️ オフライン作業中`（未同期件数） |
| 同期 | オフライン保存 → オンライン復帰でバックグラウンド flush · SW `tisly-offline-core-sync` |
| 音声入力 | Web Speech API · `/js/tisly-voice-input-v1.js` — 見積明細/備考 · ナレッジ · 現調メモ |
| 見積 UX | 「🎙️ 音声で明細追加」— VVF/台数などを末尾追記（既存明細は上書きしない） |
| コード | `tisly-offline-core-v1.js` · `tisly-online-indicator-v1.js` · `tisly-voice-input-v1.js` · `tisly-practical-nav.js` |
| テスト | `server/test/offline-voice-v1.test.ts` |
| 確認 | `/estimate-v1` · `/knowledge-quick-v1` · `/survey-v1` · https://tisly.jp/api/health |

### TOMS 見積爆速化 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | OCR結果へ TOMS 標準単価を自動補完 · 履歴ワンタップ保存 · LINE共有テキスト |
| マスター | `toms-master-data-v1.ts` — VVF / PF管 / ボックス / LAN / カメラ / 配線工事 / 設定費 / 人工 |
| 補完 | `unitPrice=0` のみ類似品名マッチで単価提案（明示単価は上書きしない） |
| 履歴 | `toms_estimate_history_v1` + localStorage `tisly_toms_estimate_history_v1` |
| UI | `/estimate-v1` — PDF出力 / LINE共有テキスト / 履歴保存 · TOMS履歴タブ · 再利用 |
| API | `/api/estimate/v1/toms-master` · `/toms-master/suggest` · `/toms-estimate-history` · `/toms-estimate-share-text` |
| 既存保護 | OCR解析・見積作成・モックは削除せず追記のみ |
| テスト | `server/test/toms-master-history-v1.test.ts` |
| 確認 | `/estimate-v1` · https://tisly.jp/api/health |

### Tenant SaaS v1（完成済み — 組織・マルチ通貨・契約ステータス）

| 領域 | 内容 |
|------|------|
| 目的 | バイアウト単位の `tenant_id` · AU 展開向け国/通貨 · SaaS 契約ステータス |
| DB | `customers` / `devices` に `country_code` · `currency` · `plan_status` · `monthly_fee` 追記（既存削除なし） |
| 既定値 | `country_code=JP` · `currency=JPY` · `plan_status=active` · `monthly_fee=0` |
| API | `GET/PATCH /api/tenant-saas/v1`（owner/admin） |
| UI | `/settings-v1` — ダーク高コントラスト「月額契約・設定エリア」カード |
| 表示 | 稼働中/試用期間中 · 日本/オーストラリア · 月額 · 組織ID · 接続デバイス数 |
| コード | `tenant-saas-v1.ts` · `tenant-saas-store-v1.ts` · `tenant-saas-v1` routes |
| テスト | `server/test/tenant-saas-v1.test.ts` |
| 確認 | `/settings-v1` · https://tisly.jp/api/health |

### Neon Dark Mode UI v1（完成済み — サイバーパンク高コントラスト）

| 領域 | 内容 |
|------|------|
| 目的 | 現場PWAをネオン・ダーク（ガラス＋発光）へ刷新 — **既存データ/CSSは削除せず追記** |
| CSS | `/css/tisly-neon-dark-v1.css` — `#0d0f12` 基調 · cyan `#00f2fe` · blue `#4facfe` · alert `#ff007f` |
| JS | `/js/tisly-neon-dark-v1.js` — stylesheet注入 · タップ発光 · お客様向けパス除外 |
| 注入 | `tisly-practical-nav.js` + 実務HTMLへ link 追記 · `/remote-v1` · `/app` |
| タップ | 主要ボタン/スイッチ/リレー最低 48px · `tisly-neon-tap-glow` |
| SW | `tisly-pwa-v2420-neon-dark` |
| テスト | `server/test/neon-dark-ui-v1.test.ts` |
| 非対象 | `/customer*` · knowledge-customer（白基調維持） |
| 確認 | `/app` · `/survey-v1` · `/remote-v1` · https://tisly.jp/api/health |

### 白ベース×紺色 UI + 見積一覧 QNAP保存 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 実務PWAを清潔な白ベース×紺色へ統一 · 請求書作成済み案件の見積/請求 PDF を一覧から QNAP 保存 |
| CSS | `tisly-neon-dark-v1.css` · `tisly-friendly-ui.css` · `tisly-practical-nav.css` に navy `#1E3A8A` 追記（既存削除なし） |
| 一覧UI | `/estimate-v1` — ゴミ箱左隣に紺色 HardDrive「QNAP保存」（見積準備済み / 請求作成済み） |
| API | `POST /api/estimate/v1/projects/:id/qnap-save-invoices-estimates` |
| 保存先 | `TiSLY_Storage/Invoices_Estimates/YYYY-MM/`（MotherShip パス追記） |
| 通信 | **VPS サーバーサイドプロキシのみ** — ブラウザ→QNAP 直通信は廃止（CORS/Mixed Content 回避）。接続解決は `QNAP_WEBDAV_*`（ENV）→ 設定 UI → `QNAP_HOST` / `QNAP_LOCAL_HOST` |
| SW | `tisly-pwa-v2437-qnap-job-poll-toast` |
| コード | `estimate-invoice-qnap-save-v1.ts` · `estimate-v1.js` `listCardActionsHtml` |
| テスト | `server/test/navy-ui-qnap-list-v1.test.ts` |
| 確認 | `/estimate-v1` · https://tisly.jp/api/health |

### TiSLY Eco-Water v1（完成済み — アルカリ排水自動中和デモ）

| 領域 | 内容 |
|------|------|
| 目的 | 生コンプラント／工場向け **アルカリ排水自動中和** の営業・現場デモ UI |
| 画面 | `/eco-water-v1` · `/app/eco-water` · `/customer/eco-water` |
| Phase a | pH 特大表示 · 危険/安全バッジ · CO₂電磁弁インジケータ（開=点滅） |
| Phase b | Chart.js 折れ線 · pH 8.5 中和開始 · 5.8〜8.6 安全ゾーン |
| Phase c | デモ: アルカリ投入(pH12.3) · 自動中和(12.3→7.2) · バルブ連動 |
| Phase d | 水質安全証明書モーダル · 改ざん防止ハッシュ · 印刷/PDF |
| Phase e | 月額保守カード（校正合格・次回2026/09/01 · PoE/Modbus-RTU） |
| Phase f | **複数現場切替** — 守谷ピットA / 筑波水処理槽B / 土浦苛性洗浄 · 現場名・pH状態・直近校正・ハッシュPrefix 動的切替 |
| Phase g | **中和履歴カード** — タイムスタンプ・前後pH・放流適合・証明書再表示 · デモ完了時に先頭追記 |
| Phase h | **LocalStorage バッファ** — `tisly_eco_water_history_v1` · `tisly_eco_water_selected_site_v1`（リロード保持） |
| Phase i | **IoT テレメトリ API** — `POST /api/eco-water/telemetry`（PLC/RP2350/Modbus JSON 受信）· `GET /api/eco-water/status?site_id=` · SSE `/status/stream` |
| Phase j | **LIVE モード** — PWA で DEMO/LIVE 切替 · SSE 優先・ポーリング fallback · 既存デモ・LocalStorage は非破壊 |
| Phase k | **証明書ハッシュ** — `EW-[SITE]-[TIMESTAMP]-[SALT]` → SHA-256 · 中和完了(pH≈7.2)時に API 応答へ付与 |
| Phase l | **印刷1ページ固定** — `@media print` で max-height:100vh / overflow:hidden / page-break-after:avoid · 空白2枚目抑止 · 発行日と計測日時分離 |
| App Hub | `practicalApps` に `eco_water_v1` カード追記 |
| Customer | ホームカード「水質・排水」追記（既存6カードは非改変） |
| UI | 白 `#FFFFFF/#F8FAFC` × ネイビー `#1E3A8A/#0F172A` |
| SW | `tisly-pwa-v2441-eco-water-print-fix` |
| コード | `server/public/eco-water-v1.html` · `js/features/eco-water/*` · `src/eco-water/eco-water-sim-v1.ts` · `eco-water-sites-v1.ts` · `eco-water-history-v1.ts` · `eco-water-telemetry-store-v1.ts` · `eco-water-cert-hash-v1.ts` · `api/routes/eco-water.ts` |
| テスト | `server/test/eco-water-v1.test.ts` |
| 確認 | `/eco-water-v1` · `/api/eco-water/status?site_id=EW-TKB` · `/app` · `/customer` · https://tisly.jp/api/health |

### ガス見守り・ボンベ残量 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | ガスメーター自動検針 · 高齢者見守り · 緊急遮断 · ガス屋向けボンベ重量管理 |
| お客様 | `/customer/gas-monitor` — 🟢正常稼働中 / 🔴緊急遮断 · 当日使用量 m³ グラフ · 生活見守りテキスト |
| 事業者 | `/gas-monitor-v1` · `/app/gas-monitor` — 積算パルス · 1/2本目 kg・%バー · 要配送ソート |
| モック | 戸建て · アパート複数世帯 · 店舗 · AU サンプル（`tenant_id` / JP·AU / JPY·AUD）追記のみ |
| API | `GET /api/gas-monitor/v1/customer` · `/operator` · `/properties` |
| App Hub | `gas_monitor_v1` カード追記（既存カード非改変） |
| Customer | ホームカード「ガス見守り」追記（既存カード非改変） |
| UI | 白 `#FFFFFF/#F8FAFC` × ネイビー `#1E3A8A` · 大ボタン · カードUI |
| SW | `tisly-pwa-v2444-gas-building-lifecare` |
| コード | `src/gas-monitor/*` · `api/routes/gas-monitor.ts` · `gas-monitor-v1.html` · `gas-monitor-customer-v1.html` · `js/features/gas-monitor/*` |
| テスト | `server/test/gas-monitor-v1.test.ts` |
| 確認 | `/customer/gas-monitor` · `/gas-monitor-v1` · `/app` · https://tisly.jp/api/health |

### ガス見守り 建物グループ + Life Care v1.1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | アパート等を建物親カードでグループ化 · Life Care 見守りバッジ |
| 親カード | 建物名 · 所在地 · 総部屋数 · 要配送/警報/見守り件数バッジ · アコーディオン展開 |
| 部屋カード | 積算パルス · ボンベ残量 · Life Care バッジ · ミリ波滞留 |
| Life Care | 🟢正常生活反応 / 🟡24時間ガス未検知 / 🔴浴室・トイレ長滞留 / 🚨地震自動遮断 |
| 警報UX | 黄・赤カード枠点滅 · 高コントラストバッジ |
| 建物 | つくばコーポ（4室）· Melbourne Harbour（AU/AUD）等 |
| データ | 既存物件は非破壊 · Life Care オーバーレイ · 末尾に部屋追記 |
| API | `GET /api/gas-monitor/v1/operator`（buildings）· `/buildings` |
| SW | `tisly-pwa-v2444-gas-building-lifecare` |
| コード | `gas-monitor-buildings-v1.ts` · `gas-monitor-life-care-v1.ts` · operator/customer UI |
| テスト | `server/test/gas-monitor-v1.test.ts`（建物・Life Care ケース追記） |
| 確認 | `/gas-monitor-v1` · `/customer/gas-monitor` · https://tisly.jp/api/health |

### マルチ NAS（書類 nastoms / システム TiSLYNAS）v1（完成済み）

| 領域 | 内容 |
|------|------|
| 書類保存用 | **nastoms** `192.168.1.134` — 見積書・請求書 PDF（`QNAP_LOCAL_HOST` 既定 / ストレージ UI） |
| システム用 | **TiSLYNAS** `192.168.1.10` — MotherShip・将来のシステムデータ（変更なし） |
| 既定ポート | WebDAV 探索順 **`8080`（パス `/` `/Public/` `/TiSLY/`）→ `5005` → `5006` → `5000`**（`QNAP_LOCAL_PORT` / `QNAP_PORT` で上書き可） |
| 保存経路 | **VPS プロキシ一本化** — スマホ → `https://tisly.jp/api/...` → VPS が QNAP WebDAV へ代理転送（ブラウザ直通信なし） |
| UI | `/storage-settings-v1` — 役割ラベル明記 · 保存ルート既定 `vps` |
| トースト成功 | `nastoms への接続に成功しました（ポート N）` |
| WebDAV ヘッダー | `User-Agent: TiSLY-PWA` · `Translate: f` · PUT 前に OPTIONS/PROPFIND（HTTP 501 回避） |
| トースト失敗（タイムアウト） | `VPSから nastoms への接続がタイムアウトしました。Tailscale / LAN接続状態を確認してください` |
| トースト失敗（認証） | `QNAPのユーザー名またはパスワードが正しくありません` |
| SW | `tisly-pwa-v2437-qnap-job-poll-toast` |
| コード | `estimate-invoice-qnap-save-v1.ts` · `qnap-nas-hosts-v1.ts` · `estimate-v1.js` · `qnap-client-direct-v1.js`（診断ヘルパーのみ） |

---

- [CURSOR_SELF_DRIVE_RULES.md](./CURSOR_SELF_DRIVE_RULES.md) — 自走時の行動規範
- [checklists/REGRESSION_TEST.md](./checklists/REGRESSION_TEST.md) — 回帰テスト項目
- [examples/EXAMPLE_INDEX.md](./examples/EXAMPLE_INDEX.md) — お手本カテゴリ索引
- [templates/NEXT_CURSOR_PROMPT.md](./templates/NEXT_CURSOR_PROMPT.md) — 次回作業用プロンプト雛形

### RP2350 QR物件1秒登録 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 物件選択 → RP2350 QR読取 → 接続済み表示を1操作で完了 |
| 事業者UI | `/device-binding-v1` · `/app/device-binding` |
| App Hub | 「機器をQR登録」カードを末尾追記 |
| スキャン | 背面カメラ · BarcodeDetector · html5-qrcode fallback · 手入力fallback |
| 完了通知 | 緑枠 · 振動 · 短い完了音 · 「接続済み（オンライン）」即時反映 |
| API | `GET /api/device/properties` · `POST /api/device/bind` · `POST /api/device/qr` |
| DB | `property_device_bindings_v1` — device_id一意 · 別物件への上書き禁止 |
| QR印刷 | RP2350デバイスID付きPNG QR · テプラ/シール向け印刷CSS |
| UI | 白 `#FFFFFF/#F8FAFC` × ネイビー `#1E3A8A` · 52px大ボタン |
| テスト | `server/test/device-binding-v1.test.ts` |
| 確認 | `/device-binding-v1` · `/api/device/properties` · https://tisly.jp/api/health |

### RP2350 8DI/8RO 現場マッピング v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | QR登録直後に16ポート設定・通通試験・監視反映まで完了 |
| UI | `/device-binding-v1` — DI1〜DI8 · RO1〜RO8 · 白×ネイビー大カード |
| 必須検証 | 使用中ポートの名称未入力時は保存無効 · 未使用は保存対象外 |
| DI | 🟢検知中（ON）を1秒更新 · RP2350側50msデバウンス |
| RO | 各ポートのテスト動作ON/OFF · デバイス別命令キュー |
| 設定 | パルス重み/単位 · 初期指針値 · a/b接点 · 動作モード |
| 拡張 | RS485 Modbusアドレス1〜32 · 機器名称 · 盤内現場メモ |
| DB | `device_port_configs_v1` · `device_rs485_configs_v1` · `device_field_notes_v1` |
| API | `GET /api/device/ports/config` · `POST /api/device/ports/save` · telemetry/status/relay-test/command |
| 監視反映 | `/app/gas-monitor` · `/customer/gas-monitor` に使用中ポートを動的追記 |
| ファーム | `rp2350/firmware/main.py` — telemetry · RO命令 · 50ms再読込 |
| SW | `tisly-pwa-v2445-rp2350-port-mapping` |
| テスト | `server/test/device-port-config-v1.test.ts` |
| 確認 | `/device-binding-v1` · `/gas-monitor-v1` · `/customer/gas-monitor` · https://tisly.jp/api/health |

### RP2350 実機配備ファームウェア v2（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | QR登録済み設定を Waveshare RP2350-POE-ETH-8DI-8RO へそのまま配備 |
| App Hub | surveyor以上で「機器をQR登録」を緑の「使えます」表示 |
| 物件導線 | 物件カード「機器登録・ポート変更」からQR登録または16ポート設定へ直行 |
| ファーム | `firmware/rp2350/` — `main.py` · `network_manager.py` · `pulse_counter.py` · `config.json` |
| Ethernet | PoE/LAN DHCP · `network.LAN` → W5500 SPI fallback |
| DI | DI1〜DI8 · 50msデバウンス · パルス積算 · Flash保存 |
| 緊急発報 | 感震/地震/遮断/警報/非常ラベルの状態監視DIを即時POST |
| RO | RO1〜RO8 · 3秒ポーリング命令 · 実機状態telemetry |
| ダウンロード | 管理画面から設定反映済み4ファイルを個別取得 |
| API | `POST /api/device/ports/emergency` · `GET /api/device/ports/firmware/*` |
| SW | `tisly-pwa-v2446-rp2350-firmware` |
| テスト | `server/test/device-binding-v1.test.ts` · `server/test/device-port-config-v1.test.ts` |
| 確認 | `/app` · `/device-binding-v1` · https://tisly.jp/api/health |

### 機器QR登録 物件名＆デバイスID 自由入力 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 23件の物件カードを RP2350 デモ1件へ整理し、物件名・デバイスIDを現場で自由入力 |
| 物件フォーカス | `GET /api/device/properties` — 既定は「紐付け済み物件 → デモ物件 → 先頭1件」だけ返す |
| 全件表示 | `?scope=all` + 画面の「すべての物件を表示」ボタン（既存物件は削除しない） |
| デモ判定 | `PROP-DEMOHOME001` · `DEMO-HOME-001` · 取手 佐藤邸 / TOMS設備デモ / デモ戸建て防犯 |
| 物件名入力 | 自由テキスト。既存名と一致（全角空白差は無視）→ その物件、未登録名 → **末尾に新規追記** |
| 物件解決 API | `POST /api/device/properties/ensure` — 既存は 200 / 新規は 201（既存行は改名しない） |
| デバイスID入力 | 自由テキスト + 既存IDクイックタグ維持。`TISLY-BOX-001` / `TOMS001-RP-01` 形式を許可 |
| リアルタイム連動 | 物件名 ／ デバイスID プレビュー · QRシール印刷 · 機器登録・ポート変更へそのまま引継ぎ |
| QR読取バインド | `POST /api/device/bind` に `property_name` を送信 — 読取IDと画面の物件名を紐付けて16ポート設定へ遷移 |
| ポート設定ヘッダー | `GET /api/device/ports/config` が `property` を返し「物件名 ／ デバイスID」を表示 |
| 1画面レイアウト | 物件カード（1件）→ 物件名 → デバイスID → QRを読む / 機器登録 / QRシール印刷 |
| UI | 白 `#FFFFFF/#F8FAFC` × ネイビー `#1E3A8A` · 52px大ボタン · カードUI |
| SW | `tisly-pwa-v2447-device-qr-form` |
| コード | `server/src/device/device-property-focus-v1.ts` · `device-binding-v1.ts`（routes）· `device-binding-v1.html/js/css` |
| テスト | `server/test/device-binding-v1.test.ts`（10ケース）· `server/test/device-port-config-v1.test.ts` |
| 確認 | `/device-binding-v1` · `/api/device/properties` · https://tisly.jp/api/health |

### ガスメーター実機リアルタイム監視 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | RP2350 の DI1 パルス・DI2 遮断を `/app/gas-monitor` と `/customer/gas-monitor` へ実測反映 |
| DB | `device_port_telemetry_v1` · `device_emergency_events_v1` — 既存設定を変更せず受信値を末尾追記 |
| API | 既存 `POST /api/device/ports/telemetry` · `/emergency` を使用 · ガス監視 GET は実測優先・モック fallback |
| 指標 | 積算パルス · JST日次使用量 · 初期指針+パルスまたは実機 `meterValues` の現在指針 |
| 遮断 | 最新緊急イベントと入力状態を照合 · `🚨 地震自動遮断` + `緊急遮断` を3秒以内に反映 |
| 物件 | QR紐付け済み実物件を事業者カードへ動的追記 · 既存ガスモック配列は非改変 |
| UI | 既存カード/CSS/色/バッジを維持 · 3秒ポーリング · お客様画面は DI 表記を非表示 |
| SW | `tisly-pwa-v2448-gas-meter-live` |
| テスト | `server/test/device-port-config-v1.test.ts` · `server/test/gas-monitor-v1.test.ts` |
| 確認 | `/gas-monitor-v1` · `/app/gas-monitor` · `/customer/gas-monitor` · https://tisly.jp/api/health |

### 機器QR登録 完全新規登録UI v2（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | デモ物件選択を終了し、物件名とデバイスIDの2項目から新規登録 |
| UI | `/device-binding-v1` — 新規物件名 · デバイスID · クイックタグ · QR読取 |
| 導線 | 「次へ：ポート設定・現場登録」から16ポート設定へ直接遷移 |
| QR | 読取時はID入力欄へ反映し、登録ボタンで物件作成・紐付け |
| 既存保護 | 同名物件は再利用 · 新規物件と機器紐付けは末尾追記 · 上書き禁止維持 |
| App連動 | `/app` に保存済み監視物件カードを自動追加 |
| Customer連動 | `/customer` 物件カードと見守り画面へ保存済みポートを自動追加 |
| SW | `tisly-pwa-v2449-device-new-registration` |
| テスト | `server/test/device-binding-v1.test.ts` · `server/test/device-port-config-v1.test.ts` |
| 確認 | `/device-binding-v1` · `/app` · `/customer` · https://tisly.jp/api/health |

### ガス監視 実機物件限定表示 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 過去デモ10件を監視対象から除外し、QR登録済み実機だけ表示 |
| 事業者 | `/gas-monitor-v1` · `/app/gas-monitor` — 実機件数連動サマリー |
| お客様 | `/customer/gas-monitor` — 実機物件だけ選択・表示 |
| 空状態 | 未登録時は機器QR登録を案内し、固定デモ値を表示しない |
| 即時反映 | 有効ポート保存後、3秒ポーリングで監視カードと検針を開始 |
| データ | `property_device_bindings_v1` + 有効な `device_port_configs_v1` のみ |
| SW | `tisly-pwa-v2450-gas-live-only` · ガス画面は network-first |
| テスト | `gas-monitor-v1.test.ts` · `device-port-config-v1.test.ts` |
| 確認 | `/gas-monitor-v1` · `/app/gas-monitor` · `/customer/gas-monitor` |

### ガス監視 アコーディオン状態保持 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 3秒ポーリングで開いた「詳細（▼/▲）」が勝手に閉じる・画面がチラつく問題の解消 |
| 状態保持 | `openPropertyIds`（Set）+ sessionStorage — 建物IDごとに開閉を記録 |
| 初期展開 | `hasPriorityAlert` は初回のみ自動展開 · 手動で閉じたら再展開しない |
| 差分更新 | 建物・部屋カードは DOM を作り直さず、パルス／指針値／残量バー／ステータスのみ更新 |
| 全再描画 | 建物ID・部屋IDの構成が変わった時だけ innerHTML を再構築 |
| お客様画面 | Chart.js を destroy せず `update("none")` で数値のみ更新 · 見守りメッセージ／メーターは変化時のみ更新 |
| UI | カード・バッジ・カラー・レイアウトは変更なし |
| SW | `tisly-pwa-v2451-gas-accordion-state` |
| コード | `gas-monitor-accordion-state-v1.js` · `gas-monitor-operator-v1.js` · `gas-monitor-customer-v1.js` |
| テスト | `gas-monitor-v1.test.ts`（アコーディオン保持ケース追記） |
| 確認 | `/app/gas-monitor` · `/gas-monitor-v1` · `/customer/gas-monitor` · https://tisly.jp/api/health |

### ガス監視 アコーディオン勝手閉じ 根本解消 v2（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 3秒ポーリングで開いた詳細（▼/▲）が閉じる・チラつく問題を DOM 再生成の廃止で根絶 |
| DOM 再生成廃止 | `/app/gas-monitor` · `/customer/gas-monitor` — ポーリング時の `container.innerHTML =` を全廃 |
| 初回のみ生成 | カード DOM は初回ロード時に生成 · 以降は追加／削除／並び替えのみ |
| 差分テキスト更新 | `.pulse-count-text` · `.meter-value-text` · `.status-badge` の `textContent` のみ更新 |
| 開閉方式 | `<details>` 廃止 — `.is-expanded` クラス着脱 + `display: grid / none` の直接切替 |
| 操作契機 | `[data-accordion-toggle]` の click / Enter / Space のみ（通信・再描画では変化しない） |
| アイコン | ▼→▲ は `.gm-building-card.is-expanded .gm-building-chevron` でクラス連動 |
| 状態保持 | `openPropertyIds`（Set）+ sessionStorage — 手動で閉じたら再展開しない |
| バッジ | 警報／見守り／要配送／正常を固定要素化 · 表示切替と件数テキストのみ更新 |
| UI | カード・バッジ・カラー・レイアウトは変更なし |
| SW | `tisly-pwa-v2452-gas-accordion-class`（install で skipWaiting · activate で旧cache削除） |
| コード | `gas-monitor-accordion-state-v1.js` · `gas-monitor-operator-v1.js` · `gas-monitor-customer-v1.js` · `gas-monitor-v1.css` |
| テスト | `gas-monitor-v1.test.ts`（クラス連動・差分更新ケース更新） |
| 確認 | `/app/gas-monitor` · `/customer/gas-monitor` · https://tisly.jp/api/health |

### RP2350 実機パルス増分API + 即時加算 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | RP2350のDI1単発パルスをSQLiteへ即時加算し、ガス監視画面へ3秒以内に反映 |
| API | `POST /api/meter/telemetry` · `/api/meter/update` — device token / 社内ログイン必須 |
| ペイロード | `device_id` · `port=DI1` · `pulse_increment` · `raw_state` |
| 指針値 | ポート初期指針値 + 積算パルス × パルス重み（標準 `0.01 m³/P`） |
| 遮断 | DI2 ONで `🚨 地震自動遮断` を緊急イベントへ即時記録 |
| UI | 既存カード差分更新を維持 · 実機オンライン/最終通信 · テストパルス+1送信 |
| ファーム | `firmware/rp2350/main.py` — `Pin.IRQ_FALLING` · 50msデバウンス · 即時POST |
| SW | `tisly-pwa-v2453-meter-pulse-live` |
| テスト | `device-port-config-v1.test.ts` · `gas-monitor-v1.test.ts` |
| 確認 | `/app/gas-monitor` · `/customer/gas-monitor` · `/api/meter/telemetry` |

### RP2350 実機配備ZIP v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 現場ポート設定済みRP2350を1タップで実機配備 |
| UI | `/app/gas-monitor` 現場ポートマッピング内に設定ZIPダウンロード |
| ZIP | `tisly-rp2350-firmware.zip` — `config.json` · `main.py` · `readme.txt` の3ファイル |
| GPIO | DI1〜DI8 = GPIO9〜16（Waveshare公式サンプル準拠） |
| Ethernet | オンボードW5500自動初期化 · DHCP取得 · 再接続 |
| DI1 | `Pin.IRQ_FALLING` · 50msデバウンス · パルス即時POST |
| DI2 | 両エッジ接点変化 · 地震遮断状態を即時POST |
| 通信 | 3段階リトライ · 未送信キュー · 60秒ハートビート |
| API | `GET /api/device/ports/firmware/tisly-rp2350-firmware.zip?deviceId=` |
| SW | `tisly-pwa-v2454-rp2350-firmware-zip` |
| テスト | `device-port-config-v1.test.ts` · `gas-monitor-v1.test.ts` |
| 確認 | `/app/gas-monitor` · `/api/meter/telemetry` · https://tisly.jp/api/health |

### ガス監視 物件・機器バインド削除 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | ガス監視カードから物件・実機設定・監視データを整合性を保って削除 |
| API | `DELETE /api/device/unbind` — 物件ID必須 · 事業者権限必須 |
| 削除対象 | `customer_portal_properties` · `property_device_bindings_v1` · ポート/RS485/現場メモ/テレメトリ/緊急イベント |
| 事業者UI | `/app/gas-monitor` — 物件詳細の赤系ゴミ箱 · 確認 · 件数/空状態/現場ポート即時同期 |
| お客様UI | `/customer/gas-monitor` — 選択物件の赤系ゴミ箱 · 確認 · 次物件/空状態へ即時切替 |
| セキュリティ | 削除APIはログイン済み事業者ロールのみ · 顧客コード越境削除を拒否 |
| SW | `tisly-pwa-v2455-property-delete` |
| テスト | `device-binding-v1.test.ts` · `gas-monitor-v1.test.ts` |
| 確認 | `/app/gas-monitor` · `/customer/gas-monitor` · https://tisly.jp/api/health |

### TiSLY HOME 住設・ホームIoT統合 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 分電盤CT・風呂リモコン・エアコン・玄関スマートロックを **1画面で一括統合** |
| 社内/統合入口 | `/home-v1` · `/app/home` · `/tisly-home`（302） |
| お客様/住まい入口 | `/customer/home` |
| UI | **ライトモード × 高コントラスト**（旧ダークUIから移行）— 背景 `#FFFFFF` / `#F8FAFC` · カード純白 + 枠 `#E2E8F0` · 文字 `#0F172A` / `#1E293B` · アクセント紺 `#1E3A8A` · タップ領域 52px 以上 |
| ステータス配色 | 稼働中/正常 `#16A34A` · 警報 `#DC2626` · ピークカット `#EA580C` · 空調/計測 `#2563EB` |
| 1. 分電盤CT | 主幹電流A・消費電力W/kW のゲージ · 過負荷しきい値（警告/遮断）· ピークカット連動 · 分岐回路（エアコン/エコキュート/IH/一般負荷）稼働状態 |
| 2. 風呂リモコン | 給湯温度・浴槽温度・湯はり進捗% · 「自動お湯はり」「追いだき」「ふろ保温」ワンタップ · JEMA/HA端子 + RP2350 リレー連携ステータス |
| 3. エアコン | 室温・設定温度・運転モード（冷房/暖房/除湿/送風）・風量・風向 · 電源ON/OFF · 温度±スライダー · ピーク時自動セーブ運転バッジ |
| 4. 玄関スマートロック | LOCKED 🔒 / UNLOCKED 🔓 · ドア開閉センサー · 施錠解錠トグル · NFC/RFID 入退室ログ（直近解錠者と時刻） |
| 5. スマートインターホン | 待機中 / 呼出中 🔔 / 通話中 / 自動応答済み · 「直近来客 14:20」· ライブ枠（RTSP/WebRTC、未接続はモック枠）· 「通話応答」「自動応答（置き配お願いします）」「玄関鍵を開ける（スマートロック連動）」· 来客履歴 |
| 呼出通知 | 呼出発生時に PWA 最上部ポップアップ（`#hm-ring-popup`）+ バイブレーション + Notification（許可時のみ）。同一呼出は重複表示しない |
| モックデータ | **JP** `HOME-JP-TSUKUBA-001` つくばモデルハウス（100V-200V / エコキュート · JPY）· `HOME-JP-MORIYA-ALERT` 警報デモ · **AU** `HOME-AU-GOLDCOAST-001` Gold Coast Demo House（240V / Solar+CT · AUD） |
| クイック切り替え | `home-quick-switch-v1.js` — 各画面右下の浮遊ボタン。`/app` · `/gas-monitor-v1` · `/demand-security-v1` · `/eco-water-v1` へ **追記のみ**で導入 |
| SaaS スキーマ | `home_sites_v1`（tenant_id/country_code/currency/plan_code/plan_status/monthly_fee）· `home_devices_v1`（`intercom` 種別を追加。既存行はコピーして引き継ぐ）· `home_control_logs_v1` · `home_access_logs_v1` · `home_intercom_events_v1` — シードは INSERT OR IGNORE のみ |
| API | `GET /api/home/v1/sites` · `/customer?siteId=` · `/operator` · `/quick-switch` · `/control-logs?siteId=` · `/intercom-events?siteId=` · `/switchbot-status` · `/switchbot-devices` · `POST /control` |
| 制御 | `POST /control` — target: `circuit` / `bath` / `aircon` / `lock` / `intercom`（回路ON/OFFは主幹電流を再計算） |
| 制御 action | circuit: `relay` · bath: `auto_fill` / `reheat` / `keep_warm` / `set_temp` / `temp_up` / `temp_down` · aircon: `power` / `set_temp` / `temp_up` / `temp_down` / `mode` / `fan` / `swing` / `peak_save` · lock: `lock` / `unlock` / `toggle` · intercom: `ring` / `answer` / `auto_response` / `unlock_door` / `dismiss` / `set_auto_message` |
| SwitchBot 実機 | `switchbot_client.ts`（API v1.1 HMAC）· ロック解錠/施錠 · 赤外線エアコン `setAll`/`turnOn`/`turnOff` · インターホンの `unlock_door` も実機解錠へ連動 · トークン未設定時はモック継続 |
| SwitchBot env | `SWITCHBOT_TOKEN` · `SWITCHBOT_SECRET` · `SWITCHBOT_LOCK_DEVICE_ID` · `SWITCHBOT_AIR_CONDITIONER_DEVICE_ID` |
| 実機/モック判定 | `resolveSwitchBotHomeModeV1()` — TOKEN と SECRET が揃えば `real`、無ければ `mock`。`SWITCHBOT_MODE` に依存しないので **VPS 本番でも `.env` を入れるだけで自動切替**。`GET /api/home/v1/switchbot-status` で確認（トークン・シークレットは返さず deviceId は末尾4文字のみ） |
| VPS 本番の実機化 | GitHub Secrets に `SWITCHBOT_TOKEN` · `SWITCHBOT_SECRET` · `SWITCHBOT_LOCK_DEVICE_ID` · `SWITCHBOT_AIR_CONDITIONER_DEVICE_ID` を登録すると、`deploy-vps.yml` が `/opt/tisly/server/.env` へ同期し次回デプロイで real になる。未登録ならモックのまま安全に動く |
| デバイス一覧 | `npx tsx scripts/list_switchbot_devices.ts`（`npm run switchbot:list-devices`）· API は `GET /api/home/v1/switchbot-devices` |
| App Hub | `tisly_home_v1` カード追記（既存カードは非改変） |
| Customer | ホームカード「おうち設備」追記（既存カードは非改変） |
| SW | `tisly-pwa-v2458-home-light-intercom` |
| コード | `src/home/home-sites-v1.ts` · `home-control-v1.ts` · `home-dashboard-v1.ts` · `home-store-v1.ts` · `switchbot_client.ts` · `home-switchbot-sync-v1.ts` · `api/routes/home.ts` · `db/migrate.ts`（`migrateTislyHomeIntercomV1`）· `public/home-v1.html` · `home-customer-v1.html` · `js/features/home/*` · `css/features/home/*` |
| テスト | `server/test/tisly-home-v1.test.ts`（17ケース） |
| 確認 | `/home-v1` · `/customer/home` · `/api/home/v1/operator` · https://tisly.jp/api/health |

### ガス監視 新規物件・デバイス登録 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | ガス監視画面から物件・RP2350・初期ポートを一括登録 |
| API | `POST /api/device/register` · `GET /api/device/next-id` |
| DB | 物件 · バインド · DI1/DI2設定を単一SQLiteトランザクションで追加 |
| UI | `/app/gas-monitor` — 見出し横の「➕ 新規物件を追加」· 白×ネイビーモーダル |
| 入力 | 物件名 · 設置エリア/種別 · 連番デバイスID · 初期指針値 |
| 初期ポート | DI1 ガスメーター（0.01m³/P）· DI2 地震遮断 |
| 即時反映 | 登録物件数 · 建物カード · 選択物件の現場ポートマッピング |
| ZIP | 選択デバイス専用 `config.json` 入りRP2350設定ZIP |
| SW | `tisly-pwa-v2456-property-register` |
| テスト | `device-binding-v1.test.ts` · `device-port-config-v1.test.ts` · `gas-monitor-v1.test.ts` |
| 確認 | `/app/gas-monitor` · `/api/device/register` · https://tisly.jp/api/health |

### TiSLY HOME 機器タイル・グリッド UI v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 縦長リストの詳細カードをやめ、SwitchBot 風の **タイル・グリッド**を機器操作の入口にする |
| 画面 | `/home-v1` · `/app/home`（社内）· `/customer/home`（お客様） |
| グリッド | スマホ **2列固定** · 760px 以上で3列 · 1040px 以上で4列（可変） |
| 並び順（工事屋目線） | ① 分電盤CT ② スマートロック ③ スマートインターホン ④ 風呂 自動 ⑤ エアコン（台数ぶん末尾） |
| タイル構成 | アイコン · 機器名 · 状態テキスト（1〜2行）· 右上ワンタップ操作 · 「詳しく操作する ›」 |
| 状態テキスト | CT `56.8A / 10.0kW` · ロック `施錠済み` / `解錠中` · 風呂 `自動お湯はり中` / `追いだきON` · エアコン `冷房 26℃` / `停止中` · インターホン `待機中` / `呼出あり！` |
| 右上ボタン | ロック 施錠/解錠 · インターホン 応答/自動応答 · 風呂 `風呂 自動 ON/OFF` · エアコン 電源 · CT は状態バッジ（操作なし） |
| 詳細パネル | 既存の詳細カードを `.hm-detail-panel` として折りたたみ保持 — タイルタップで1枚だけ開き「閉じる」で戻る（回路ON/OFF · 湯はり · 温度± · 施錠 · 来客履歴はすべて維持） |
| お客様表記 | `plain` モードでやさしい言い方（`電気の使用量` · `玄関のかぎ` · `置き配`） |
| タップ領域 | 操作ボタン・閉じる 44px 以上 · 詳細タップ領域 76px 以上 · 機器名は2列幅で1行 |
| 差分更新 | 台数・並びが同じならタイル DOM を作り直さずテキスト/クラスのみ更新（ポーリングのチラつき防止） |
| 浮遊ボタン | `.hqs-fab`（クイック切替）が最下段カードに被らないよう `.hm-main` 下余白 152px |
| SW | `tisly-pwa-v2459-home-tile-grid` |
| コード | `public/js/features/home/home-tiles-v1.js` · `public/css/features/home/home-tiles-v1.css` · `home-v1.html` · `home-customer-v1.html` · `home-operator-v1.js` · `home-customer-v1.js` |
| 検証 | `scripts/capture-home-tiles-v1.mjs`（iPhone SE/14 · 列数 · 横スクロール · タップ領域 · ワンタップ施錠解錠）· `scripts/capture-home-tiles-zoom-v1.mjs`（目視用）· `scripts/check-home-html-balance.mjs` |
| テスト | `server/test/tisly-home-v1.test.ts`（18ケース） |
| 確認 | `/home-v1` · `/customer/home` · https://tisly.jp/api/health |

### Knowledge Module Eco-Water pH 保守カード追記（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | Eco-Water 向け pH 電極の寿命基準とクエン酸洗浄手順を Knowledge へ追記 |
| 方針 | 既存カード・配列は削除せず、末尾に 2 件 append |
| カード1 | 工業用・水質pHセンサーの耐久性と寿命基準（寿命差・乾燥厳禁・定期交換サブスク） |
| カード2 | pHセンサーの定期点検・現場メンテナンス手順（クエン酸洗浄・点検モード） |
| タグ | `#IoT` `#水質` `#保守` `#Eco-Water` / `#施工方法` `#点検` |
| Module | `module-items.json` 末尾追記 · `knowledge-eco-water-ph-seed-v1.ts` |
| Cards | `EW-PH-LIFE-001` · `EW-PH-CITRIC-001` |
| UI | `/knowledge-module-v1` 詳細ダイアログに本文（`body`）表示 |
| テスト | `knowledge-module-v1.test.ts` · `knowledge-module-api-v1.test.ts` |
| 確認 | `/knowledge-module-v1` · `/knowledge-search-v1?q=pH` · https://tisly.jp/api/health |

### Knowledge Module Eco-Water 現場カード追記（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | RS485 不通切り分け · pH 2 点校正 · 水質センサー浸漬設置を Knowledge へ追記 |
| 方針 | 既存カード・配列は削除せず、末尾に 3 件 append |
| カード1 | RS485・Modbus通信の結線と不通トラブルシューティング（A/B逆接・終端120Ω・片端接地） |
| カード2 | pHセンサーの標準液校正（キャリブレーション）手順（6.86/4.01/9.18・ゼロ点/スパン） |
| カード3 | 水質センサーの現場配管・浸漬設置基準（45度以上・VP管スリーブ・常時浸漬） |
| タグ | `#IoT` `#通信` `#RS485` / `#施工方法` `#保守` `#Eco-Water` `#点検` / `#現場` |
| Module | `module-items.json` 末尾追記 · `knowledge-eco-water-field-seed-v1.ts` |
| Cards | `EW-RS485-MODBUS-001` · `EW-PH-CAL-001` · `EW-SENSOR-INSTALL-001` |
| UI | `/knowledge-module-v1` 詳細ダイアログに本文（`body`）表示 |
| テスト | `knowledge-module-v1.test.ts` · `knowledge-module-api-v1.test.ts` |
| 確認 | `/knowledge-module-v1` · `/knowledge-search-v1?q=RS485` · https://tisly.jp/api/health |

### 価格・原価マスター v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 現場で仕入原価・販売価格・粗利を即確認 |
| 画面 | `/price-cost-master-v1` · `/app/price-cost-master` |
| タブ | 材料・パーツ原価 · 月額サブスクプラン · 標準工事・作業単価 |
| 初期データ | pHトランスミッター ¥18,436/¥32,000 · 電極 ¥3,500/¥8,000 · RP2350 RS485 ¥4,500/¥12,000 · IP65ボックス ¥2,800/¥6,500 · Eco-Waterライト月額¥3,300粗利¥2,800 · 標準保守月額¥7,700粗利¥5,800 · 盤設置¥35,000 · VPスリーブ¥25,000 · 校正試運転¥15,000 |
| 方針 | 既存見積マスター `/master-v1` は非改変 · 新規シード追記のみ |
| UI | 検索 · カテゴリチップ · 粗利カード · ダーク/ライト切替 |
| App Hub | `price_cost_master_v1` カード追記（既存カード非改変） |
| API | `GET /api/price-cost-master/v1/catalog` |
| SW | `tisly-pwa-v2462-price-cost-master` |
| コード | `src/price-cost-master/*` · `price-cost-master-v1.html` · `js/css/features/price-cost-master/` |
| テスト | `server/test/price-cost-master-v1.test.ts` |
| 確認 | `/price-cost-master-v1` · `/app` · https://tisly.jp/api/health |

### 8統一ジャンル + 価格/ナレッジ連携 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 電気工事会社OSとして 8ジャンルを全モジュールで共通化 |
| ジャンル | 電気工事 · 防犯カメラ · ネットワーク · TV工事 · エアコン · 空調 · 音響 · IOT関連 |
| 定数 | `server/src/shared/genres/tisly-genres-v1.ts` — 別名マッピング付き |
| 価格マスター | ジャンルピル絞り込み · 追加/編集モーダル · ダーク高コントラスト |
| 初期追記 | VVF · IPカメラ · PoEスイッチ · 同軸 · エアコン配管 · 音響アンプ · ESP32/RP2350 等 |
| 既存保護 | 旧シード9件の ID/価格は非改変 · ジャンルは enrich 時に付与 |
| ナレッジ | 上部フィルタを8ジャンル化 · pH/RS485/配線へ IOT関連・電気工事タグ追記 |
| 工事カテゴリ | `master/work-categories.json` へ不足ジャンルを末尾追記 |
| API | `POST/PATCH /api/price-cost-master/v1/items` · catalog `genre` / `genres` |
| SW | `tisly-pwa-v2466-security-floor` |
| テスト | `price-cost-master-v1.test.ts` · `knowledge-module-v1.test.ts` · `knowledge-module-api-v1.test.ts` |
| 確認 | `/price-cost-master-v1` · `/knowledge-module-v1` · https://tisly.jp/api/health |

### ホームセキュリティ フロア俯瞰＆発報発光 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 施主・管理者が間取り上で発報箇所を一目で把握 |
| 社内 | `/security-v1` · `/app/security-v1` · `/app/security` |
| お客様 | `/customer/security` |
| UI | 白 `#FFFFFF/#F8FAFC` × ネイビー `#1E3A8A` · 発報 `#EF4444` pulse-glow |
| フロア | 1F / 2F / 屋外・ガレージ タブ切替 |
| センサー | 玄関ロック/ドア · リビングミリ波 · 勝手口 · ガスメーター · 分電盤 |
| 警備 | 在宅警備 / 外出警戒 / 警戒解除 |
| モック | JP つくばモデルハウス（2階建て）· AU Sydney Demo House（平屋）末尾追記 |
| SaaS | tenant_id · country_code · currency · plan_code · plan_status · monthly_fee |
| Knowledge | ミリ波DI直結 · クリアイエロー塗装 · ガスパルス · 格安SIM を既存配列へ append |
| API | `GET /api/security-floor/v1/customer` · `/operator` · `/sites` · `POST /guard-mode` · `/sensor-state` |
| SW | `tisly-pwa-v2468-soc-failsafe` |
| テスト | `server/test/security-floor-v1.test.ts` |
| 確認 | `/security-v1` · `/customer/security` · https://tisly.jp/api/health |

### ホームセキュリティ Dark Cyber SOC UI v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | フロア俯瞰を **3Dアイソメトリック・ダークサイバー監視センター** へ刷新 |
| 方針 | 既存サイト・センサー・API・ナレッジは削除せず追記。ライトCSS変数は残す |
| 画面 | `/security-v1` · `/customer/security`（`sf-soc`） |
| 3D | 外周・1F・2F・屋根を CSS 3D 積層 · `pulse-alarm` 発報グロー · 発報地点ピン |
| 右パネル | アラーム件数 · 連動ライブモック · 対応完了 |
| 下部 | アラームログ（種別/フロア/キーワード）· 照明一括 · 警備セット · 通知テスト · CSV |
| モック追記 | 守谷市 美園の家 · 屋根/太陽光 · カメラ/窓センサー · Sydney Roof/PV |
| API追記 | `POST /alarm-ack` · `/lighting` · `/test-notify` · dashboard `soc` |
| SW | `tisly-pwa-v2468-soc-failsafe` |
| テスト | `server/test/security-floor-v1.test.ts` |
| 確認 | `/security-v1` · `/customer/security` · https://tisly.jp/api/health |

### ホームセキュリティ Light Command UI v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **TiSLY Security** 白ベース刷新 · 3D俯瞰を最上部へ · 縦スクロール360°回転 |
| 方針 | 既存サイト配列・API・ナレッジは削除せず追記。屋根フロアは `enabled:false` + UI非表示 |
| 画面 | `/security-v1` · `/customer/security` |
| タイトル | TiSLY Security |
| テーマ | 背景 `#F8FAFC`/`#FFFFFF` · カード白+`#E2E8F0` · ネイビー/`#2563EB` · 発報 `#EF4444` pulse-alarm |
| フロア | 全体俯瞰 · 外周・敷地 · 2F · 1F（屋根/太陽光タブ削除） |
| 3D | インラインSVG即時描画 · `window.scrollY` → `rotateX(55deg) rotateZ()` · タッチドラッグ視点移動 |
| 確認 | `/security-v1` · `/customer/security` · https://tisly.jp/api/health |

### ホームセキュリティ 不透明ドラム式フロア切替 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 半透明積層の重なり解消 · **縦回転シリンダー**で 2F → 1F → 外周を切替 |
| 画面 | `/security-v1` · `/customer/security` |
| 3D | `perspective: 1000px` · `rotateX` + `translateZ` · 白 `#FFFFFF` 不透明カード · 枠 `#1E293B` · `backface-visibility: hidden` |
| 操作 | マップ上下スワイプ/ホイール · タブ（2F / 1F / 外周）· `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| 間取り | 手書き平屋図面準拠 · 勝手口キッチン / リビング洋 / 和10畳 / 和8畳 等 · 美園の家データ破棄 |
| 発報 | 通知テスト → **勝手口キッチン** 全体・壁・センサーが `alert-beacon` 赤ネオングロー |
| 初期化 | 「読み込み中…」なし · 平屋デモ宅を即時展開（1F中央固定）· ボタンは同期 JS で 0 秒反応 |
| CSV | UTF-8 BOM `\uFEFF` 付き（Excel 文字化け防止） |
| SW | `tisly-pwa-v2473-security-handplan` |
| テスト | `server/test/security-floor-v1.test.ts` |
| 確認 | `/security-v1` · `/customer/security` · https://tisly.jp/api/health |

### 3D Floorplan Builder PWA v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **方眼紙スキャン＆3D斜め俯瞰（アイソメ）ジェネレーター** — Security 俯瞰の背景マップ生成 |
| 方針 | `/security-v1` · `/customer/security` は非破壊。独立ビルダーとして新規追加 |
| 画面 | `/builder` · `/floorplan-builder` · `/app/builder` · `tisly_3d_floorplan_builder.html` |
| UI | **白基調**（`#F8FAFC`〜`#FFFFFF` · 境界 `#E2E8F0` · 文字 `#0F172A`）· 3Dもライトグレー背景 |
| 写真取込 | **カメラ撮影**（`capture=environment`）と **フォルダ/アルバム**（captureなし）を分離 · PCはドラッグ&ドロップ対応 |
| 機能 | 方眼紙写真読込 · グリッド重ね · 1F/2F/外周タブ · Three.js アイソメ俯瞰 · 壁高/透過調整 |
| プリセット | つくばモデルハウス（2階建て＋外周）· 平屋デモ住宅 |
| 連携 | LocalStorage `tisly_floorplan_config` · API 保存 · 「TiSLY Securityに送信」→ `/security-v1?fromBuilder=1` |
| API | `/api/floorplan-builder/v1/*`（presets · save · active · security-bridge · load-preset · **detect**） |
| SW | `tisly-pwa-v2483-floorplan-ux-pin` |
| コード | `src/floorplan-builder/*` · `public/tisly_3d_floorplan_builder.html` · `js/css/features/floorplan-builder/` · `src/app/builder/page.tsx`（RN/Next 流用スタブ） |
| テスト | `server/test/floorplan-builder-v1.test.ts` |
| 確認 | `/builder` · `/api/floorplan-builder/v1/presets` · https://tisly.jp/api/health |

### 3D Floorplan Builder Auto-Detect & Editor v1.1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **方眼紙写真から間取りを自動認識**し、現場で部屋枠を微調整 · Security へ同期 |
| Auto-Detect | `POST /api/floorplan-builder/v1/detect` — Gemini Vision → 失敗時 `rule_based_v1`（手書き平屋テンプレ） |
| UI | 「⚡ 方眼紙をAI解析・間取り生成」· 写真取込後も自動解析 |
| 部屋エディタ | 移動 · 四隅リサイズ · 追加 · 削除 · 名前タップ（プリセット/自由入力） |
| 背景アライメント | ズーム/不透明度スライダー · ドラッグ位置合わせ · ピンチズーム |
| 3D同期 | 部屋編集がアイソメ俯瞰へリアルタイム反映 |
| Security | 保存後「TiSLY Securityに送信」で新間取りを反映（既存ブリッジ維持） |
| 型 | `FloorplanBgTransformV1`（scale / offsetX / offsetY / opacity） |
| コード | `floorplan-detect-v1.ts` · `floorplan-detect-gemini-v1.ts` · `floorplan-detect-rule-v1.ts` · builder JS/CSS/HTML |
| テスト | `floorplan-builder-v1.test.ts`（detect / editor UI アサーション追記） |
| SW | `tisly-pwa-v2483-floorplan-ux-pin` |
| 確認 | `/builder` · `/api/floorplan-builder/v1/detect` · https://tisly.jp/api/health |

### TiSLY Security 3Dアイソメ俯瞰 v1（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 監視マップを **ビルダー連携の3Dアイソメトリック（斜め立体俯瞰）** に全面刷新 |
| 方針 | センサー監視・通知・警備モード API は維持。マップ描画のみ Three.js 置換 |
| 画面 | `/security-v1` · `/customer/security` |
| 3D | Three.js · OrbitControls · CSS2D センサーピン · ガラス調壁 · グラデーション床 |
| 発報 | 部屋ブロック全体の赤ネオンパルス（`setAlert` / `alertVisible`） |
| フロア | 1F / 2F / 外周タブ連動 · Shift+ホイールでも切替 |
| 連携 | Floorplan Builder `tisly_floorplan_config` · `fromBuilder=1` ブリッジ |
| SW | `tisly-pwa-v2483-floorplan-ux-pin` |
| コード | `security-floor-iso3d-v1.js` · map/light/orbit/operator/customer · bridge |
| テスト | `server/test/security-floor-v1.test.ts` |
| 確認 | `/security-v1` · `/customer/security` · https://tisly.jp/api/health |

### Floorplan / Security 3D ネオンピン完全同期 v1.3（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | **2D固定HTMLオーバーレイ廃止** · 3Dメッシュ/スプライトでピンを回転・ズームに100%追従 |
| Builder | 3Dアイソメ上で Raycaster による配置・選択・ドラッグ · フロート配置パレット |
| Security | CSS2Dセンサーピン撤去 · `createNeonPinMesh3d` · 発報時ピン/部屋パルス発光 |
| JSON | `devices[].x/y/z` + `worldX/worldY/worldZ` + `kind` を Security へ引継ぎ |
| SW | `tisly-pwa-v2483-floorplan-ux-pin` |
| コード | `tisly-neon-pin-mesh-v1.js` · floorplan-builder · security-floor-iso3d · map-v1 |
| テスト | `floorplan-builder-v1.test.ts` · `security-floor-v1.test.ts` |
| 確認 | `/builder` · `/security-v1?fromBuilder=1` · https://tisly.jp/api/health |

### Floorplan / Security 3D ネオンピン & 外壁撤去 v1.2（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 緑外壁フレーム撤去 · 存在する階のみ表示 · サイバーネオンピン · Builder デバイス配置 |
| 外壁 | Builder / Security 双方で walls バウンディング描画を廃止（部屋ブロックのみ） |
| フロア | `floorHasContent` — 空の 2F（なし）をタブ/ドラムから除外 · 平屋デモは 2F `enabled:false` |
| ピン | 半透明グラデーションのフローティング・ロケーションピン + ミニマル SVG |
| Builder | 配置パレット（カメラ/ドア/鍵/電源/ミリ波）· DnD 配置 · ドラッグ移動 · タップ削除 |
| JSON | `floors[].devices` → `security.devices` で TiSLY Security へ引継ぎ |
| SW | `tisly-pwa-v2483-floorplan-ux-pin` |
| コード | `tisly-device-pin-icons-v1.js` · floorplan-builder · security-floor-iso3d · map-v1 |
| テスト | `floorplan-builder-v1.test.ts` · `security-floor-v1.test.ts` |
| 確認 | `/builder` · `/security-v1` · https://tisly.jp/api/health |

### ������E���C�����V���b�g���͂� v1�i�����ς݁j

| �̈� | ��e |
|------|------|
| �ړI | ���@�����u������v��ǋL���A���C�� DO CH1 �� 0.5 �b�����V���b�g��p UI |
| ���� | HOME-JP-ITABASHI-LIVE �E �����s���� �E operationMode=live �E Waveshare RP2350-POE-ETH-8DI-8RO |
| �����ی� | ���� / ��J / Gold Coast �͍폜���������ǋL�̂� �E ssertHomeDemoSitesPreservedV1 |
| ���C UI | �ǂ������E�ۉ��E�������x �} ���\�� �E ���C���u?? �����͂�i�����{�^���j�v�E ���M��/�w�ߊ����t�B�[�h�o�b�N |
| API | POST /api/devices/rp2350/relay/1/pulse �E POST /api/remote-test/ch1/pulse �E home uto_fill �A�� |
| �R�}���h | ch1_pulse_500 ? �t�@�[���� ON��500ms��OFF ����[�J�����s |
| SW | 	isly-pwa-v2484-itabashi-bath-pulse |
| �R�[�h | home-sites-v1.ts �E home-control-v1.ts �E 
p2350-relay-pulse-v1.ts �E 
p2350-relay-v1.ts �E firmware main.py |
| �e�X�g | server/test/tisly-home-v1.test.ts |
| �m�F | /home-v1?siteId=HOME-JP-ITABASHI-LIVE �E https://tisly.jp/api/health |

### App Hub 主要モジュールカード完全復旧（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | `/app` 現場ハブの大きいカード UI をマスタービジョン順で完全復旧 |
| 表示 | 3D間取り・フロア俯瞰図 · Security · HOME · ミリ波 · デマンド · QR登録 · 価格原価 · 通話音声 · Document Center · 案件ダッシュボード · 日程調整 |
| 非表示維持 | 今日のオペレーション · Deploy/監査/リハーサル（`showOpsPanels:false` · `operations:null`） |
| 順序 | `FIELD_HUB_PRACTICAL_IDS` に `floorplan_builder_v1` · `project_dashboard_v1` を追記し指定順へ |
| UI | 主要3カード（3D/Security/HOME）を `field-primary` 強調 · 640px幅 · 2列グリッド |
| テスト | `multi-pwa-app-hub` · `dashboard-v1` · `customer-enabled-modules-v1` |
| 確認 | https://tisly.jp/app · https://tisly.jp/api/health |

### Knowledge 製造DX STL（方眼紙×Gemini Vision）

| 領域 | 内容 |
|------|------|
| 方針 | 既存カード・配列は削除せず、末尾に 1 件 append |
| タイトル | 【製造DX】方眼紙スケッチ✕Gemini Visionによる手書き図面からの即時STL生成 |
| Module | module-items.json 末尾追記 · knowledge-factory-stl-seed-v1.ts |
| Mock | MOCK_FACTORY_STL_ITEMS |
| Card | FACTORY-STL-GEMINI-001 |
| タグ | #3Dプリンター #AI_Vision #GeminiAPI #手書き図面DX #TiSLY_Factory #PWA |
| テスト | knowledge-module-v1 / knowledge-module-api-v1 |
| 確認 | /knowledge · https://tisly.jp/api/health |

### Knowledge 製造DX Revopoint MINI 2

| 領域 | 内容 |
|------|------|
| 方針 | 既存カード・配列は削除せず、末尾に 1 件 append |
| タイトル | 【製造DX】Revopoint MINI 2連携・PWA上での3Dスキャンデータ管理とリバースエンジニアリング |
| Module | module-items.json 末尾追記 · knowledge-revopoint-scan-seed-v1.ts |
| Mock | MOCK_REVOPOINT_SCAN_ITEMS |
| Card | REVOPOINT-MINI2-SCAN-001 |
| タグ | #Revopoint #3Dスキャナー #ThreeJS #リバースエンジニアリング #現場DX #PWA |
| テスト | knowledge-module-v1 / knowledge-module-api-v1 |
| 確認 | /knowledge · https://tisly.jp/api/health |

### Knowledge 製造DX 3Dハイブリッド保存

| 領域 | 内容 |
|------|------|
| 方針 | 既存カード・配列は削除せず、末尾に 1 件 append |
| タイトル | 【製造DX】PWA 3Dモジュール運用フローとQNAP/IndexedDBハイブリッド保存設計 |
| Module | module-items.json 末尾追記 · knowledge-hybrid-3d-store-seed-v1.ts |
| Mock | MOCK_HYBRID_3D_STORE_ITEMS |
| Card | FACTORY-3D-HYBRID-STORE-001 |
| タグ | #3Dプリンター #QNAP #IndexedDB #ThreeJS #データ保存 #TiSLY_Factory #PWA |
| テスト | knowledge-module-v1 / knowledge-module-api-v1 |
| 確認 | /knowledge · https://tisly.jp/api/health |

### Knowledge 製造DX パラメトリック寸法 2件

| 領域 | 内容 |
|------|------|
| 方針 | 既存カード・配列は削除せず、末尾に 2 件 append |
| 1 | 現場リアルタイム寸法微調整・パラメトリック差分更新アーキテクチャ |
| 2 | 3Dパラメトリック寸法ナンバリング・インデックス連動UI設計 |
| Module | module-items.json 末尾追記 · knowledge-parametric-3d-seed-v1.ts |
| Mock | MOCK_PARAMETRIC_3D_ITEMS |
| Card | FACTORY-3D-PARAM-DELTA-001 · FACTORY-3D-PARAM-NUMBER-001 |
| テスト | knowledge-module-v1 / knowledge-module-api-v1 |
| 確認 | /knowledge · https://tisly.jp/api/health |

### Knowledge 製造DX/保守DX Part1（3件）

| 領域 | 内容 |
|------|------|
| 方針 | 既存カード・配列は削除せず、末尾に 3 件 append |
| 1 | Revopoint MINI 2 · PWA 3Dビューアー · QNAP/IndexedDB |
| 2 | パラメトリック寸法ナンバリング＆リアルタイム差分更新UI |
| 3 | QR直結再出力 · AR原寸重ね合わせ干渉チェック |
| Module | knowledge-factory-dx-part1-seed-v1.ts |
| Mock | MOCK_FACTORY_DX_PART1_ITEMS |
| テスト | knowledge-module-v1 / knowledge-module-api-v1 |
| 確認 | /knowledge · https://tisly.jp/api/health |

### Knowledge 製造DX Part2（4件）

| 領域 | 内容 |
|------|------|
| 方針 | 既存カード・配列は削除せず、末尾に 4 件 append |
| 1 | Saturn 4 Ultra ✕ K2 Plus ハイブリッド出力＆結合アセンブリ |
| 2 | 3Dプリンター稼働監視 · PWA通知 · 積層強度AI |
| 3 | インサートナット熱圧入 · 原価試算 · 耐候性樹脂ナビ |
| 4 | インシュロック固定ブリッジ · 端子モールド一体成形 |
| Module | knowledge-factory-dx-part2-seed-v1.ts |
| Mock | MOCK_FACTORY_DX_PART2_ITEMS |
| テスト | knowledge-module-v1 / knowledge-module-api-v1 |
| 確認 | /knowledge · https://tisly.jp/api/health |

### Knowledge 防犯DX 赤外線ビーム単管マウント

| 領域 | 内容 |
|------|------|
| 方針 | 既存カード・配列は削除せず、末尾に 1 件 append |
| タイトル | 赤外線ビームセンサー用 単管マウント架台＆誤報防止バイザー設計 |
| Module | knowledge-ir-beam-mount-seed-v1.ts |
| Mock | MOCK_IR_BEAM_MOUNT_ITEMS |
| Card | SEC-IR-BEAM-MOUNT-VISOR-001 |
| 確認 | /knowledge · https://tisly.jp/api/health |

### Knowledge 製品化DX RJ45ビームハウジング

| 領域 | 内容 |
|------|------|
| 方針 | 既存カード・配列は削除せず、末尾に 1 件 append |
| タイトル | TiSLYオリジナル・ポール＆壁面両対応RJ45ビームセンサーハウジング設計 |
| Module | knowledge-rj45-beam-housing-seed-v1.ts |
| Mock | MOCK_RJ45_BEAM_HOUSING_ITEMS |
| Card | SEC-RJ45-BEAM-HOUSING-001 |
| 確認 | /knowledge · https://tisly.jp/api/health |

### 3D寸法ナンバリングバッジ連動（print-generator）

| 領域 | 内容 |
|------|------|
| 方針 | 既存テンプレ・寸法配列は削除せず、UI/3D オーバーレイを追加 |
| スライダー | navy×白の丸数字バッジ（①②③…）を見出しに自動付与 |
| 3D | CSS2DRenderer ビルボード + 寸法ガイド線 |
| 連動 | ホバー/ドラッグ中は対象バッジ・寸法線をシアンハイライト |
| SW | tisly-pwa-v2505-dim-number-badges |
| 確認 | /3d-generator · https://tisly.jp/api/health |

### 3Dプリント ビューワー 戻るナビ

| 領域 | 内容 |
|------|------|
| 方針 | 既存ダークUIは維持し、戻るボタンのみ navy で追記 |
| ヘッダー | ← 戻る（44px・history.back / fallback /3d-generator） |
| キャンバス | 左上半透明フロート ← |
| SW | tisly-pwa-v2506-pmv-back-nav |
| 確認 | /print-model-viewer · https://tisly.jp/api/health |

### 3Dプリント ビューワー ヘッダー横崩れ修正

| 領域 | 内容 |
|------|------|
| ナビ | pmv-header-bar で戻る左・操作右の1行 |
| タイトル | 全幅 + white-space:nowrap（縦1文字崩れ防止） |
| 削除 | キャンバス上のフロート戻るボタン |
| SW | tisly-pwa-v2507-pmv-header-fix |
| 確認 | /print-model-viewer · https://tisly.jp/api/health |

### Knowledge 施工DX スマートインターホン + Security UI

| 領域 | 内容 |
|------|------|
| 方針 | 既存ナレッジは削除せず末尾に 1 件 append |
| Card | SEC-SMART-INTERCOM-TD-SM5030-001 |
| Module | knowledge-smart-intercom-seed-v1.ts |
| Mock | MOCK_SMART_INTERCOM_ITEMS |
| UI | security-v1 sf-intercom-link（呼出/応答/CH1解錠） |
| SW | tisly-pwa-v2509-smart-intercom |
| 確認 | /security-v1 · /knowledge · https://tisly.jp/api/health |

### HOME 玄関インターホン連携 正式配置

| 領域 | 内容 |
|------|------|
| UI | home-v1 / home-customer に hm-intercom-link 追記 |
| JS | home-intercom-link-v1.js（CH1解錠・HomeLink・シミュレーション） |
| Knowledge | HOME-INTERCOM-TD-SM5030-001 append |
| SW | tisly-pwa-v2510-home-intercom-link |
| 確認 | /home-v1 · https://tisly.jp/api/health |

### Text-to-3D 自然言語・音声プロンプト

| 領域 | 内容 |
|------|------|
| UI | 3d-generator に AIプロンプトカード（音声+生成） |
| API | POST /api/print-generator/v1/prompt-parse |
| Knowledge | FACTORY-TEXT-TO-3D-001 append |
| SW | tisly-pwa-v2511-text-to-3d-prompt |
| 確認 | /3d-generator · https://tisly.jp/api/health |

### マルチアングル方眼紙 Vision 抽出

| 領域 | 内容 |
|------|------|
| UI | 最大4枚サムネ・✕削除・ガイド文言 |
| API | POST /api/print-generator/v1/sketch-extract |
| Knowledge | FACTORY-MULTI-ANGLE-SKETCH-001 append |
| SW | tisly-pwa-v2512-multi-angle-sketch |
| 確認 | /3d-generator · https://tisly.jp/api/health |

### TESTER001 実機遮断デモ + Android 全画面 WebView（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | ココナラ審査用に TESTER001 を実機から切り離し、Android を Chrome 枠なし WebView 化する |
| TESTER001 | `tester.user` / 任意（サーバー最上流で無条件 200。固定トークン `tester-token-2026`）。DB 成否に関わらず 200。フロントはローカル配列判定せず API へパススルー＋固定セッション直結。RP2350 DO はモック |
| 既存保護 | 豊島邸・板橋自宅・ナレッジ配列は削除しない。TOMS001 の実機経路は維持 |
| Android | `StartActivity`（TiSLY HOME + 開始する）→ アプリ内 WebView で `https://tisly.jp/customer` |
| AAB | `npm run build:android` → `play-console-upload/TiSLY-com.tisly.app.aab` |
| SW | `tisly-pwa-v2541-tester-login-hardpass` |
| テスト | `server/test/tester-hardware-mock-v1.test.ts` · `server/test/tester-tenant-v1.test.ts` |
| 確認 | `/customer` · https://tisly.jp/api/health |

---

## Capacitor iOS / App Store Connect（追加）

| 項目 | 状態 |
|------|------|
| Bundle ID | `jp.tisly.app` |
| Capacitor | `capacitor.config.ts` · `webDir=www` · 本番 `server.url=https://tisly.jp` |
| CI | `.github/workflows/ios-deploy.yml`（macos-latest · workflow_dispatch / `ios-v*` / `release/ios`） |
| 手順書 | [../ios-deploy-guide.md](../ios-deploy-guide.md) |
| 既存データ | 変更なし（survey_photos / completion_photos / VPS デプロイ分離） |
| ローカル検証 | `npm run ios:check` · `npm run cap:prepare`（Xcode は CI のみ） |


### iOS Build & Deploy 正規 WF（追記）

| 項目 | 状態 |
|------|------|
| 正規 WF | `.github/workflows/ios-build-deploy.yml` |
| ASC 3キー手順 | [../IOS_SECRETS_SETUP.md](../IOS_SECRETS_SETUP.md) |
| Info.plist テンプレ | `ios-ci/Info.plist.permissions.template.xml` |
| 旧 WF | `ios-deploy.yml` は誘導のみ（タグ二重起動防止） |

### 板橋自宅 防犯ライト手動バイパス + JST 判定修正（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | PWA 手動点灯・威嚇・緊急全点灯を時間帯インターロックから切り離し、センサー連動は JST 18:00〜06:00 を正しく判定する |
| 手動 | `bypassSchedule: true` · ファーム `execute_manual_command` はスケジュール非参照 · キャンセル競合で即消灯しない |
| GPIO | 板橋 DO2=GPIO18 · DO3=GPIO19 · 論理ON→HIGH（`RO_ACTIVE_LOW` / `CH_INVERT` で反転可） |
| 時刻 | VPS は UTC+9 算術 · firmware JSON に `jstMinutes` / `lightScheduleActive` |
| SW | `tisly-pwa-v2543-itabashi-light-bypass` |
| 確認 | `/security-v1` · `/api/home/v1/control` · https://tisly.jp/api/health |

### 板橋自宅 DI擬似発報→実機DO点灯パイプライン（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | `test-di-trigger` が Push/ログだけで終わらず、実センサーと同じ JST 評価を通して夜間は RP2350 の DO2/DO3 を即時点灯する |
| API | `POST /api/home/v1/hardware/test-di-trigger` → `queueHomeSensorLinkedLightsV1` → `sensor_pulse_{A\|B\|C}_{ms}` |
| 時刻 | `isWithinTimeRange` は Asia/Tokyo（UTC+9）。19:00 JST は窓内でリレーをブロックしない |
| 実機 | `execute_vps_sensor_command` が DO2+DO3 を維持秒数後に自動消灯。物理 DI1/DI2 は `_can_run_lights()`（VPS `jstMinutes`）で即時序列 |
| SW | `tisly-pwa-v2544-itabashi-di-trigger-lights` |
| 確認 | `/security-v1` Pro DI擬似発報 · https://tisly.jp/api/health |

### Security画面 3DマップUI完全撤去（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 板橋自宅および Security 画面から 3D 間取りキャンバス・階層タブ・展開スライダー・「3Dマップ」タブを外し、ステータス直下にライト操作と遠隔ルールを置く |
| 対象 | `/security-v1` · `/security-customer-v1`。iso3d エンジンと間取り配列・RP2350 DI/DO は削除しない |
| UI | 社内タブは「警報」「ログ」。顧客は「家のようす／お知らせ／履歴」。白×紺のままコンパクト配置 |
| SW | `tisly-pwa-v2545-security-no-3d-map` |
| 確認 | `/security-v1` · `/security-customer-v1` · https://tisly.jp/api/health |

### 板橋自宅 Security 物件選択・オンライン初期化（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 物件セレクタが空のまま起動し 🔴 オフライン固定になる不具合を直し、板橋自宅を初期選択して 5 分以内の HB で 🟢 オンラインを描く |
| 原因 | 3D撤去後も iso3d が `three` を静的 import し、operator/customer モジュール全体が起動失敗 |
| 修正 | iso3d はマウントがある時だけ動的 import。セレクタ初期値は `SEC-JP-ITABASHI-LIVE`。boot/更新で `/api/home/v1/itabashi/status` を no-store 再取得 |
| SW | `tisly-pwa-v2547-tester-login-force-restart` |
| 確認 | `/security-v1` · https://tisly.jp/api/health |

### TESTER001 ハードコード認証 + VPS プロセス強制再起動（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 本番 `https://tisly.jp/customer` で TESTER001 が `Customer not found` にならないよう、ログイン API 先頭で 200 を返し、デプロイ時に Node を強制再起動する |
| API | `POST /api/auth/customer/login` と `/api/auth/customer-login`。`req.body.customerCode === TESTER001` を関数最上部で判定。ユーザー名 `TESTER001` / `tester.user` も通す |
| 応答 | `success` · `tenantId: TESTER001` · `userName: tester.user` · `siteId: HOME-JP-ITABASHI-LIVE` · `displayName: テスターデモ（板橋）` · `modules: ["security","home"]` · `hardwareMock: true` |
| 再起動 | `scripts/vps-force-restart-node.sh` — `systemctl stop/start/restart tisly-server` · `pm2 restart all` · `:3080` 残留 kill · ログイン probe |
| SW | `tisly-pwa-v2547-tester-login-force-restart` |
| 確認 | https://tisly.jp/customer · https://tisly.jp/api/health |

### 豊島邸 遠近2段階ビーム＆100Vフラッシュ連動（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 豊島邸主装置の赤外線ビーム遠近2段階と 100V ライト2台＋フラッシュ連動を PWA から遠隔設定する |
| 端子 | DI1 遠・外周 / DI2 近・アプローチ / DO1 主照明 / DO2 増設投光器 / DO3 100Vフラッシュ（CRサージ保護） |
| モード | `2STEP` · `DIRECT` · `SILENT` — クラウド同期 `security_mode` |
| 動作 | DI1: 24h Push「⚠️ 外周で接近検知」· 夜間 DO1 / DI2: 24h Push「🚨 建物至近で侵入検知！」· 夜間 DO1+DO2 + フラッシュ |
| 入口 | お客様 `https://tisly.jp/customer` · 社内 `https://tisly.jp/app` |
| 既存保護 | 2.2 旧表・はなれ端子・板橋自宅・ナレッジ配列は削除せず追記 |
| SW | `tisly-pwa-v2548-toyoshima-2step-flash` |
| 確認 | `/security-v1` · `/customer/security` · https://tisly.jp/api/health |

### 社内顧客管理 認証情報詳細パネル（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 社内 Customer Master で顧客コード・ログインID・初期パスワードを展開表示し、個別／3点一括コピーする |
| 画面 | `/app/customer-master-v1`（社内専用）。お客様入口 `https://tisly.jp/customer` は変更なし |
| 表示 | マスク `••••••••` · 👁️ で平文切替 · 📋 個別コピー · 🔑 3点一括コピー |
| 参照 | 正規顧客は `CUSTOMER_DEMO_PASSWORD`（既定 `demo-remote-2026`）。発行・再発行PWは詳細パネルへ即反映 |
| 既存保護 | テナント配列・豊島邸／板橋データは削除せず。顧客向け API には平文を出さない |
| SW | `tisly-pwa-v2549-customer-auth-detail` |
| 確認 | `/app/customer-master-v1` · https://tisly.jp/api/health |

### 豊島邸 実機DOリレー直結キック＆OTA復旧（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | PWA 手動点灯を昼夜無視で実機 CH1〜CH3 へ即時キックし、DO青LED点灯まで疎通する |
| 命令 | 豊島専用 `GET /api/home/v1/toyoshima/command?deviceId=`（板橋 remote-test と分離） |
| 手動 | 一括ON / ライト1 / ライト2 / フラッシュ威嚇はスケジュール完全バイパス |
| センサー | DI1→DO1 / DI2→DO1+DO2+DO3フラッシュ。`force_relay_test` 時は昼間もリレー可 |
| GPIO | Waveshare RO1〜RO8 = GPIO17〜24。HIGH=コイルON |
| OTA | `/app` 「最新ファームウェアを現場実機へ遠隔配信」`force:true` · `POST /api/devices/firmware/ota` |
| 入口 | お客様 `https://tisly.jp/customer` · 社内 `https://tisly.jp/app` |
| 既存保護 | 2.2 / 2.2.1・はなれ・板橋・ナレッジ配列は削除せず追記 |
| SW | `tisly-pwa-v2550-toyoshima-relay-kick` |
| 確認 | `/app` · `/customer` · https://tisly.jp/api/health |

### 豊島邸 手動ライトボタン結線＆センサーリレー保証（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | 「ライト1点灯」「ライト2点灯」「フラッシュ威嚇テスト」が無反応だった UI を修復し、センサー連動で DO 青 LED を点灯する |
| UI | `data-ts-light-kick` を document capture で結線。soft patch でボタン DOM を壊さない |
| トースト | 「ライト1を点灯しました」「ライト2を点灯しました」「フラッシュ威嚇テストを開始しました」 |
| センサー | `force_relay_test` 時は昼夜・警戒OFFでも CH を即時 HIGH |
| 入口 | お客様 `https://tisly.jp/customer` · 社内 `https://tisly.jp/app` |
| 既存保護 | 豊島・板橋・ナレッジ配列は削除せず |
| SW | `tisly-pwa-v2551-toyoshima-light-kick-ui` |
| 確認 | `/app` · `/customer` · https://tisly.jp/api/health |

### 豊島邸 顧客安心カード＆即時リレーパイプライン（完成済み）

| 領域 | 内容 |
|------|------|
| 目的 | `/customer` 先頭に社内と同様のシステム安心カードを置き、PWA 手動点灯を実機へ即時到達させる |
| 顧客UI | 稼働ステータス / ネットワーク遅延 / 盤内温度 / 最終確認時刻 / 「🔄 最新状態に更新」 |
| 即時経路 | `GET /api/home/v1/toyoshima/command?waitMs=` 長待ち + heartbeat 同梱 `command` + PWA WebSocket `toyoshima/relay` |
| 実機 | `main_toyoshima.py` が waitMs=2000 で受信。昼夜を無視して CH1〜CH3 を HIGH（DO青LED） |
| 入口 | お客様 `https://tisly.jp/customer` · 社内 `https://tisly.jp/app` |
| 既存保護 | 2.2 / 2.2.1 / 2.2.2・はなれ・板橋・ナレッジ配列は削除せず追記 |
| SW | `tisly-pwa-v2552-toyoshima-instant-relay` |
| 確認 | `/app` · `/customer` · https://tisly.jp/api/health |

### Phase 10 Tailscale VPN 復旧＆QNAP 保存（2026-09-21）

| 領域 | 内容 |
|------|------|
| 目的 | VPS↔QNAP の Tailscale 疎通を確認し、WebDAV 保存の揺らぎ耐性を上げる |
| VPN | VPS `100.82.225.90` · QNAP `tislynas` `100.99.31.120` · ping 0% loss |
| アプリ | `QNAP_WEBDAV_TIMEOUT_MS` 既定 **12000ms** · File Station SID の CDATA 対応 |
| ガード | `QNAP_LOCAL_PORT=5522`（VPS SSH）を WebDAV 候補から除外 |
| 実NAS | WebDAV 5005/5006 は停止。File Station は `errorValue=-1`（パスワード不一致） |
| 人間 | QNAP で WebDAV 有効化＋QTS ログイン確認。入口 URL は変更なし |
| 既存保護 | ナレッジ配列・現場設定・API ルートは削除せず追記 |
| SW | `tisly-pwa-v2552-toyoshima-instant-relay` |
| 確認 | `/app` · `/customer` · https://tisly.jp/api/health |

### 豊島邸 DO1/DO2 手動点灯の確実連動（2026-09-21）

| 領域 | 内容 |
|------|------|
| 目的 | 一括ON / ライト1 / ライト2 が実機 GPIO HIGH まで届く |
| PWA | `data-ts-light-kick` を document capture。API は `queued:true` 必須 |
| 命令 | ライト1=`do1_on` CH1 / ライト2=`do2_on` CH2 / 一括=`bulk_on` CH1+CH2+CH3 |
| 実機 | `channels` 配列で GPIO 直叩き。昼夜無視。HIGH=コイルON（DO青LED） |
| OTA | 社内「最新ファームウェアを現場実機へ遠隔配信」`force:true` |
| 入口 | お客様 `https://tisly.jp/customer` · 社内 `https://tisly.jp/app` |
| 既存保護 | 2.2 系・はなれ・板橋・ナレッジ配列は削除せず追記 |
| SW | `tisly-pwa-v2553-toyoshima-do-force` |
| 確認 | `/app` · `/customer` · https://tisly.jp/api/health |

### 豊島邸 DI/DO 完全バインド＆OTA 1.2.2（2026-09-22）

| 領域 | 内容 |
|------|------|
| 目的 | 母屋 DI1/DI2 が実機リレーを欠落しないよう GPIO を同期キックし、PWA 手動点灯と OTA 1.2.2 を保証する |
| DI1 | 遠・外周 → CH1 (DO1/GPIO17) を lightingDurationSec HIGH |
| DI2 | 近・至近 → CH1+CH2 HIGH + CH3 フラッシュ 15 秒点滅 |
| テストモード | `force_relay_test` 既定 True。昼間でもリレー駆動 |
| 実機ループ | `poll_inputs()` 先行 · `COMMAND_WAIT_MS=0` · `LOOP_IDLE_MS=50` |
| 手動 | `/customer` `/app` のライト1/ライト2/一括ON/OFF → `do1_on`/`do2_on`/`bulk_on`/`bulk_off`(CH1-3) |
| VPS | 擬似発報も `sensor_far`/`sensor_near` を実機キューへ積む |
| OTA | `FIRMWARE_LOGIC_VERSION=1.2.2` をクラウド最新として広告しステージング |
| 既存保護 | 2.2 系・はなれ・板橋・ナレッジ配列は削除せず追記 |
| SW | `tisly-pwa-v2554-toyoshima-maint-std` |
| 確認 | `/app` · `/customer` · https://tisly.jp/api/health |

### 豊島邸 手動 DO1/DO2/DO3 完全連動＆OTA 1.2.3（2026-09-22）

| 領域 | 内容 |
|------|------|
| 目的 | PWA ライト1/ライト2/一括ON が実機 CH1〜CH3 を確実に HIGH 駆動する |
| ライト1 | `do1_on` → CH1 / GPIO17 HIGH |
| ライト2 | `do2_on` → CH2 / GPIO18 HIGH |
| 一括ON | `bulk_on` → CH1+CH2+CH3 / GPIO17+18+19 HIGH |
| GPIO | Waveshare 8RO は HIGH=コイルON をファーム強制。`RO_ACTIVE_LOW` 無視 |
| PWA | `/customer` `/app` 外構ライト手動操作。session header 付き即時 POST |
| OTA | `FIRMWARE_LOGIC_VERSION=1.2.3` をクラウド最新としてステージング |
| 既存保護 | 2.2 系・はなれ・板橋・ナレッジ配列は削除せず追記 |
| SW | `tisly-pwa-v2555-toyoshima-do-bind` |
| 確認 | `/app` · `/customer` · https://tisly.jp/api/health |

### 豊島邸 即時 /event ソケット化とスライダー色分け（OTA 1.2.12 / 2026-09-22）

| 領域 | 内容 |
|------|------|
| 実機 | `/event` を 2.5秒タイムアウトの生ソケットで送信。HB 非依存 |
| サーバ | 検証済みイベントは失敗しても 200 `accepted` |
| UI | 点灯秒＝暖色、感度 ms＝寒色 |
| OTA | **1.2.12** |
| SW | `tisly-pwa-v2561-event-slider-split` |
| 既存保護 | 2.2 系・はなれ・板橋・顧客データは削除せず追記 |
| 確認 | https://tisly.jp/api/health |

### 社内物件切替・通知条件・顧客カメラCTA（2026-09-22）

| 領域 | 内容 |
|------|------|
| 社内 `/app` | 物件セレクタで感応度スライダーと Web Push 条件がテナント連動。変更は即時保存 |
| 通知 | 緊急 / サイレント / OFF をセンサー別に反映 |
| 顧客 `/customer` | 映像・スナップ非表示。Guard Viewer「カメラを見る」のみ |
| SW | `tisly-pwa-v2560-toms-site-notify-camera` |
| 既存保護 | 2.2 系・はなれ・板橋・顧客データは削除せず追記 |
| 確認 | https://tisly.jp/api/health |

### 豊島邸 Web Push 強制発火（2026-09-22）

| 領域 | 内容 |
|------|------|
| 対象 | `TOYOSHIMA001` · `dispatchToyoshimaSensorNotifyV1` |
| 原因 | アラーム履歴は残るが Push がゲート／購読漏れで沈黙する |
| サーバ | `sensor_alert` 記録後は `sendWebPush` を無条件で await。失敗は `Push Send Error:` |
| 購読 | `notification_tokens` + `pwa_subscriptions` |
| 既存保護 | 2.2 系・はなれ・板橋・顧客データは削除せず追記 |
| 確認 | https://tisly.jp/api/health |

### 豊島邸 即時 /event の確実発火（OTA 1.2.11 / 2026-09-22）

| 領域 | 内容 |
|------|------|
| 対象 | `TOYOSHIMA001` · 母屋・はなれ RP2350 · `/event` |
| 原因 | `create_task` 内の通信／エンコード例外が沈黙し、即時 POST が走らない |
| 実機 | GPIO 後に同期 1 回 `/event`。失敗時だけ非同期再送。例外は握る |
| サーバ | `/event` は 2 秒バーストのみ抑制。初回検知は Push を止めない。HB は sticky ON＋45秒 |
| OTA | **1.2.11** |
| 既存保護 | 2.2 系・はなれ・板橋・顧客データは削除せず追記 |
| 確認 | https://tisly.jp/api/health |

### 豊島邸 センサー通知の重複ループ防止（OTA 1.2.10 / 2026-09-22）

| 領域 | 内容 |
|------|------|
| 対象 | `TOYOSHIMA001` · `/event` · heartbeat `inputStates` |
| 原因 | 45秒後にサーバ DI を `off` へ戻していたため、次の 5 分 HB の `on` が新規検知扱いになる |
| 実機 | 送信成功後 `_event_acked` を立て、物理 OFF まで同じ DI を再送しない。キュー成功分は破棄 |
| サーバ | クールダウン解除でも DI は保持。同一センサー短時間重複は Push スキップ |
| UI | 見るエリア非表示・警戒 ON/OFF・夜間ライト分離は維持 |
| OTA | **1.2.10** |
| 確認 | https://tisly.jp/api/health |

### 豊島邸 センサー検知の即時 /event 送信（OTA 1.2.9 / 2026-09-22）

| 領域 | 内容 |
|------|------|
| 対象 | `TOYOSHIMA001` 母屋・はなれ RP2350 |
| 原因 | DI 検知 POST が 5 分 heartbeat の後ろに回り、Push が遅延する |
| 実機 | GPIO を先に上げ、`/event` を独立キュー＋ `create_task` で即時送信。失敗は 200ms 再送。HB は待たない |
| サーバ | `/event`（source=event）はクールダウンで止めない。heartbeat バックアップだけ重複抑制 |
| OTA | `FIRMWARE_LOGIC_VERSION` / `OTA_VERSION` = **1.2.9** |
| 既存保護 | DI/DO 配列・板橋ファーム・顧客データは削除せず追記 |
| 確認 | https://tisly.jp/api/health |

### 豊島邸 通知ストッパー解除・昼夜ライト分離・警戒ON/OFF（2026-09-22）

| 領域 | 内容 |
|------|------|
| 対象 | `TOYOSHIMA001` · `/customer/security` · `/event` · heartbeat |
| 1. 通知ストッパー | `lastToyoshimaDiState` が ON のまま固まるのを 45 秒タイムアウトで `off` に戻す。再検知で何度でも Push |
| 2. 昼夜ライト | 夜間窓は `forceRelayTest` を無視して連動。日中だけ昼間テストを見る |
| 3. UI | 見るエリア（1F/外周）を顧客非表示。警戒は ON=`away` / OFF=`disarmed` の 2 択 |
| 既存保護 | `home` 型・DO 配列・板橋 3 択は削除せず残す |
| SW | `tisly-pwa-v2559-guard-onoff-notify-reset` |
| 確認 | https://tisly.jp/api/health |

### 豊島邸 センサー検知 Push 完全独立（2026-09-22）

| 領域 | 内容 |
|------|------|
| 対象 | `TOYOSHIMA001` · `/event` と heartbeat `inputStates` |
| Push | ライト制御より先に独立起動。例外でも通知は継続 |
| 条件 | 警戒解除（DISARMED）と一時停止以外は 24h `critical` |
| 履歴 | `detectedAt` / `detectedAtJst` / `sensorName` を `sensor_alert` に記録 |
| 既存保護 | DO 配列・板橋 notify は削除せず追記 |
| 確認 | https://tisly.jp/api/health |

### 豊島邸 センサー検知 Push 最終開通（2026-09-22）

| 領域 | 内容 |
|------|------|
| 対象 | `TOYOSHIMA001` · `POST /api/home/v1/toyoshima/event` |
| 原因 | おでかけ警戒でもセンサー個別 `off` が残ると `pushAllowed=false`。送信結果ログも薄い |
| 対策 | `resolveToyoshimaNotifyGateV1()` で `away` を全センサー `critical` に固定。`await` + inflight |
| ログ | `[toyoshima] event recv / notify gate / push try / push result` をサーバー出力 |
| 既存保護 | DO 制御・板橋 notify・設定配列は削除せず追記 |
| 確認 | https://tisly.jp/api/health |

### 豊島邸 Security UI クリーンアップ（一括操作重複・カメラ非表示 / 2026-09-22）

| 領域 | 内容 |
|------|------|
| 対象 | 豊島邸 `TOYOSHIMA001` · `/customer/security` · `/app` Security |
| 1. 一括操作 | 「照明を一括ON/OFF」の外側複製行を削除。`renderManualLightKickRow()` の 1 組だけ残す |
| 2. カメラ | `renderCustomerCameraCard()` は空文字を返し、ダッシュボードへ差し込まない。関数とマークアップは再表示用に残す |
| 既存保護 | 一括 API・DO 制御・Guard Viewer 起動関数は変更なし。板橋の静的カメラ CTA は触らない |
| SW | `tisly-pwa-v2558-toyoshima-ui-cleanup` |
| 確認 | `/customer/security` · `/app` · https://tisly.jp/api/health |

### Security 設定 UI の視覚化強化（SVG・昼夜カード・スライダー / 2026-09-22）

| 領域 | 内容 |
|------|------|
| 対象 | `/customer/security` · `/app` Security。既存ロジック・保存 ID は変更なし |
| 1. フロア切替 | 3D枠の外に「見るエリア」カードを追加。`1F`（家 SVG・屋内）と `外周`（樹木 SVG・敷地・外構）。選択中は紺塗り＋白アイコン |
| 2. 昼夜カード | `☀️ 日中（通知のみ）` / `🌙 夜間（ライト点灯＋通知）` を SVG＋見出しで対比。JST 現在時刻で「いま」札を塗る（`paintDayNightTiles`） |
| 3. 点灯スライダー | 左右に ⏱️短め / 長め💡 の SVG、現在秒数を紺ピルで大きく表示、4点目盛り |
| 既存保護 | `sf-lighting-duration` 等の input id・保存処理は据え置き。配列・ルールは削除せず追記のみ |
| SW | `tisly-pwa-v2557-security-ui-visual` |
| 確認 | `/customer/security` · `/app` · https://tisly.jp/api/health |

### Security 設定 UI の視覚化（アイコン・昼夜タイル・秒数スライダー / 2026-09-22）

| 領域 | 内容 |
|------|------|
| 対象 | `/customer/security`（豊島邸ダッシュボード）と Security フロア切替タブ |
| 1. フロア切替 | `renderFloorTabs` / `renderSocLayerButtons` に `socFloorIconSvg()` のインライン SVG を追加（1F=家・2F=建物・外周=樹木＋地面・全体=レイヤー）。`currentColor` なので紺⇔白の反転に追従 |
| 2. 昼夜カード | `renderDayNightRuleCard()` を新設。`☀️ 日中` と `🌙 夜間` の 2 タイルで、日中は「通知のみ」／夜間は「ライト点灯＋通知」を明示。`isWithinLightScheduleV1()` で JST 現在時刻を判定し、稼働中の側だけ「いま」札＋反転配色（日中=淡黄／夜間=紺グラデ） |
| 昼間連動 ON 時 | 日中タイルの説明を「通知＋テスト点灯（昼間連動ON）」に切替（`forceRelayTest` の実挙動と一致） |
| 警戒解除中 | 両タイルを減光し「ライトも通知も停止します」と注記 |
| 3. 秒数スライダー | `renderSecondsSliderField()` に統一。現在値を紺のピル（1.32rem）で強調し、左右に `⏱️ 短め` / `長め 💡`、下に 4 点目盛り（最小・1/3・2/3・最大）。ライト維持・フラッシュ・段階接近・DO ライトの 4 か所に適用 |
| 既存ロジック保護 | 値表示の id（`ts-*-val`）と `input` イベントの束縛・保存処理は変更なし。装飾とレイアウトのみ追加 |
| 静的 HTML | `security-customer-v1.html` の `sf-customer-lighting-duration` も同じ装飾に（`sf-slider-rich`） |
| CSS | `security-floor-v1.css`（`.sf-tab--iconed` / `.sf-slider-rich`）· `toyoshima-security-v1.css`（`.ts-dn-*` / `.ts-slider-rich`）を追記。白ベース × 紺 `#1e3a8a` |
| SW / キャッシュ | `tisly-pwa-v2556-security-ui-icons` · `security-v1.html` と `security-customer-v1.html` の `?v=` を 2556 へ |
| テスト | `security-floor-v1.test.ts` に UI 固定アサート 14 件追加。同 9 件 PASS · 豊島・通知系 65 件 PASS · home/navy/clone 68 件 PASS |
| 既存の既知失敗 | `pwa-route-repair-v4.test.ts` の SW `v2418` 参照は HEAD 時点から失敗（本改修と無関係の古い札照合） |
| 確認 | `/customer/security` · https://tisly.jp/api/health |

### 豊島邸 センサー検知 → Push 通知の独立ディスパッチ（2026-09-22）

| 領域 | 内容 |
|------|------|
| 症状 | 手動の通知テストは届くのに、センサー（DI）検知で Push が来ない |
| 調査 | ダッシュボードのタイムラインに `main_beam` が 1 件も無く、VPS ログにも検知なし。**実機が旧ファーム（1.1.0・`lib/tisly_ota.py` 欠落）だったため `/event` を投げていなかった**のが一次原因（USB 書き込みで解消） |
| 二次要因 | `POST /api/home/v1/toyoshima/event` の回帰テストが皆無。`processToyoshimaSecurityEventV1` は `pushSent: true` を**固定で返す**ため、送れていなくても成功に見えていた |
| 対策1 | `dispatchToyoshimaSensorNotifyV1()` を新設。Push を DO 制御より先に起動し **await せずにリレーを駆動**。結果だけ最後に回収して応答へ返す |
| 対策2 | 通知本文にセンサー名を入れる（例: `外周ビーム（母屋・遠）が反応しました（豊島邸）`）。名称は `TOYOSHIMA_SENSOR_LABELS_V1` の 1 か所定義でダッシュボードと共用 |
| 対策3 | 発報履歴 `sensor_alert` を **Push 可否によらず必ず記録**（`sensorId` / `sensorLabel` / `notifyMode` / `skipReason` 付き）。送信結果は新カテゴリ `push_notify` に残す |
| 対策4 | 通知・履歴の全経路を try/catch で保護。失敗しても DO 制御・応答は継続 |
| 実機側 | `_fire_di` は SILENT でも通知を先に送る。`send_event` が例外でもリレーは点く（ホストテストで固定） |
| テスト | `server/test/toyoshima-sensor-push-v1.test.ts` 6 件新規（実機と同じ payload で POST・履歴・見送り理由・リレー継続）。豊島系サーバ 64 件 · home 系 60 件 PASS |
| 既存保護 | 板橋・はなれ・ナレッジ・既存ログ行は変更なし。カテゴリは追加のみ |
| 確認 | `/customer/security` · https://tisly.jp/api/home/v1/toyoshima/dashboard |

### 豊島邸 実機 USB 直接書き込みで蘇生（OTA 1.2.8 / 2026-09-22）

| 領域 | 内容 |
|------|------|
| 症状 | 実機が旧版のまま赤ランプ。OTA も届かない |
| 真因 | 実機の `lib/` に **`tisly_ota.py` と `tisly_rgb.py` が存在しなかった** → 自己更新も RGB 状態表示も不能。`main.py` は 18,844B（`fw=1.1.0-toyoshima-online`）のまま |
| 手段 | `python -m mpremote`（1.28.0）· `COM6`（Waveshare RP2350-eth-8di-8ro を `sys.implementation._machine` で同定） |
| 保全 | 書き込み前に実機全ファイルを `rp2350/backup/toyoshima-20260922/` へ退避。`toshima_security.py`・`config.json`・`shippable.json`・`*_backup.py` は残置 |
| 転送 | `main.py`(39,111B) · `toyoshima_security.py`(30,554B) · `config.py`(2,325B) · `boot.py` · `tisly_self_test.py` · `lib/tisly_ota.py` · `lib/tisly_rgb.py` |
| 版整合 | サーバ台帳 1.2.8 に対しバンドルが 1.2.7 で `pending` が残るため、バンドルを **1.2.8** へ揃えた |
| OTA 申告 | `load_ota_state()` が状態ファイル未作成時に `{"version":"1.0.0"}` を返し USB 書き込み直後に 1.0.0 と誤申告していた → 空辞書を返し `config.OTA_VERSION` で申告 |
| 起動実測 | `relay pinmap CH1=GPIO17 CH2=GPIO18 CH3=GPIO19` → `lan ok` → `IP 192.168.1.85` → `heartbeat sent (main) ONLINE` → `polling start`。セーフモード非突入・`board_temp=40.5C` |
| ツール追加 | `rp2350/tools/capture_boot_log.py` — Ctrl-C ×2 → Ctrl-D でソフトリセットし起動ログを採取（cp932 端末でも落ちない） |
| 既存保護 | はなれ・板橋・ナレッジ配列・現場設定は変更なし |
| 確認 | https://tisly.jp/api/firmware/toyoshima/version · `/app` 豊島ダッシュボード |

### 顧客向け PDF の社内メモ排除＆PDF メタ復活（2026-09-22）

| 領域 | 内容 |
|------|------|
| 症状 | 仕様書 PDF の表紙に「メモ」節が出て、`現調PWA v1 連携 (SVY-…) / 部材N件 / 写真N枚` と現調メモが顧客に見えていた |
| 影響2 | メモ節で表紙セクションが 3 つになり `resolveCoverPhotoCapacity` が 3 枚に縮小。写真 6 枚でも 2 ページ目が発生していた |
| 対策1 | `specification-template.ts` は表紙に現調メモを載せない（2026-06 の顧客向け PDF 方針へ回帰）。節は 工事内容・設備一覧 の 2 つ固定 |
| 対策2 | `sanitizeSpecificationNotes` が `filterInternalNotesFromCustomerPdf` を経由。SVY 番号・部材件数・写真枚数を二重に排除 |
| 症状3 | `project_pdf_meta` の UNIQUE 制約違反で PDF 再生成が skip（`recordProjectPdfSavedV1`） |
| 対策3 | 存在確認を soft-delete 行も含めて行い、削除済み行は `deleted_at = NULL` で復活させる（再 INSERT しない） |
| 開発環境 | ローカル `server/.env` の日本語値が `?` に壊れて会社情報が入らなかったため既定値へ修復（本番 `.env` に TOMS_* は無くコード既定値で正常） |
| 回帰 | `estimate-v1` 31 件 · `customer-pdf-content` 5 件 PASS。PDF・保存系 8 ファイル直列で 98 件 PASS |
| 既存保護 | 写真の使い分け（現調→仕様書 / 完了→完了報告書）は変更なし |

### Phase 10 Tailscale 再実測＆QNAP 保存 E2E（2026-09-22）

| 領域 | 内容 |
|------|------|
| VPN | `tailscale status` で VPS `100.82.225.90` · QNAP `100.99.31.120` · 事務所 PC `100.66.24.94` すべて online |
| ping | 事務所 PC → QNAP **0% loss**（0〜3ms）· VPS → QNAP **0% loss**（avg 43ms）。`tailscale up` は不要 |
| WebDAV | :5005 / :5006 は **Tailscale も LAN も Connection refused** → NAS 側でサービス停止 |
| QTS | :8080 / :443 は OPEN だが PROPFIND **HTTP 501**。File Station は `authPassed=0` `errorValue=-1` |
| タイムアウト | 疎通は 12000ms 維持。**PUT / POST は 15000ms**（`QNAP_WEBDAV_UPLOAD_TIMEOUT_MS`）。File Station のタイムアウト文言も同値へ |
| E2E | `scripts/qnap-e2e-estimate-save-v1.py` — WebDAV 5 経路 → File Station 2 経路を順に試し `QNAP_SAVED_GREEN` / `QNAP_SAVED_FAIL` を出力。秘密情報は出力しない |
| E2E 実測 | VPS 実行で全経路 NG（`QNAP_SAVED_FAIL`）。原因は NAS 設定のみで VPN ではない |
| テスト環境 | `.env` の `override: true` がテスト指定を潰していた問題を `envBeforeDotenv()` で解消（テスト DB・mock provider を維持） |
| 回帰 | `qnap-*` 系 93 件 PASS（`qnap-storage-v1` の 4 件失敗を解消）· SW 札は単調増加チェックへ |
| 残作業（人間） | QTS で WebDAV 有効化＋`QNAP_WEBDAV_USER/PASSWORD` を実パスワードへ更新 → E2E 再実行で 🟢 |
| 手順書 | `docs/TODO_VPN_RECOVERY.md`「QNAP 画面 復旧手順書（2026-09-22 版）」— QTS 画面 4 手順＋つまずき表 |
| 既存保護 | 既存ナレッジ・現場設定・API ルートは削除せず追記のみ |
| 確認 | https://tisly.jp/api/health · `docs/TODO_VPN_RECOVERY.md` |

### 豊島邸 起動クラッシュ復旧＆セーフモード（OTA 1.2.7 / 2026-09-22）

| 領域 | 内容 |
|------|------|
| 症状 | 実機が起動直後にクラッシュし RGB 赤固定。遠隔から OTA も届かない |
| 静的解析 | 全ファーム `compile()` 済み — 構文エラーなし。落ちる経路は **import 時の未保護例外** |
| 特定した経路 | ① `config.py` / `toyoshima_security.py` の import が無保護 ② モジュール直下の GPIO 一括初期化 ③ 非 ASCII `print` の端末エンコード例外 ④ `tisly_ota` / `tisly_self_test` が `ImportError` のみ捕捉 |
| 対策 | `_FallbackConfig`・ロジック stub・CH/DI 単位の try/except・`_safe_print`・`except Exception` へ拡大・ループ内の個別 try/except |
| セーフモード | `_safe_mode_loop()` が LAN 維持 + `safe_mode` 付き HB + `maybe_update(force=True)` を 30 秒周期。WDT は 1 秒ごと feed |
| RGB | セーフモードは橙点滅（`set_rgb_status("safe")`）で赤固定と区別 |
| 起動ガード | `if __name__ in ("__main__", "main"): run()` — 実機は従来どおり自動起動、ホストは import 検証が可能 |
| テスト | `rp2350/test/test_toyoshima_firmware_boot.py` — machine スタブで import・GPIO 17/18/19・遅延生成・セーフモード退避・全ファイル compile |
| 既存保護 | 2.2 系・はなれ・板橋・ナレッジ配列は削除せず追記 |
| 確認 | `/app` · `/customer` · https://tisly.jp/api/health |

### 豊島邸 リレー GPIO 確定＆CH1/CH2 不点灯の解消（OTA 1.2.6 / 2026-09-22）

| 領域 | 内容 |
|------|------|
| 症状 | センサー検知で CH3 のみ点灯し、CH1（DO1）· CH2（DO2）の青 LED が点灯しない |
| 原因 | リレー Pin を OTA 対象外の `config.py`（skipFiles）の `CH_GPIO` から生成していたため、実機に古い／欠けた定義が残ると CH1/CH2 の Pin が作られず `set_ch_output` が黙って return |
| ピン確定 | `main.py` に `BOARD_CH_GPIO`（RO1〜RO8 = GPIO17〜24）· `BOARD_DI_GPIO`（DI1〜DI8 = GPIO9〜16）をハードコード。Waveshare 公式 `02-MQTT` / `01-RS485` サンプルと一致 |
| 補正 | `_resolve_pin_map` が config 側のズレをログに出して公式配列へ矯正。`set_ch_output` は Pin 未生成なら遅延生成 |
| DI1 | CH1 / GPIO17 HIGH（`lightingDurationSec`） |
| DI2 | CH1+CH2 HIGH ＋ CH3 を 15 秒（`flash_duration_sec`） |
| 昼夜 | `force_relay_test` 既定 True で昼間もリレー駆動 |
| OTA | ライブ版が store より新しければ本番も `pending=true`。`GET script` もライブと突合してから配信 |
| 既存保護 | 2.2 系・はなれ・板橋・ナレッジ配列は削除せず追記 |
| SW | `tisly-pwa-v2555-toyoshima-do-bind`（PWA 変更なし） |
| 確認 | `/app` · `/customer` · https://tisly.jp/api/health |





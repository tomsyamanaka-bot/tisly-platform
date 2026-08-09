# プロジェクト標準仕様（完成状態）

**最終更新:** 2026-07-31  
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
| ログインCTA | 青〜紫グラデ維持（`#4facfe` → `#a855f7`） |
| SW | `tisly-pwa-v2437-qnap-job-poll-toast` |

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
| AI見積エンジン基盤 | `/ai-estimate-engine-v1` → `/master-v1?tab=stats` |
| 現調図面 | `/survey-drawing-v1` |
| 案件ダッシュボード | `/project-dashboard-v1` |
| 案件詳細（実運用） | `/project-mgmt-detail-v1?projectId=` |
| Route Health | `/route-health` |
| 書類センター | `/document-center-v1`（別名 `/documents-v1`） |

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
| App Hub | `practicalApps` に `eco_water_v1` カード追記 |
| Customer | ホームカード「水質・排水」追記（既存6カードは非改変） |
| UI | 白 `#FFFFFF/#F8FAFC` × ネイビー `#1E3A8A/#0F172A` |
| SW | `tisly-pwa-v2438-eco-water` |
| コード | `server/public/eco-water-v1.html` · `js/features/eco-water/*` · `src/eco-water/eco-water-sim-v1.ts` |
| テスト | `server/test/eco-water-v1.test.ts` |
| 確認 | `/eco-water-v1` · `/app` · `/customer` · https://tisly.jp/api/health |

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

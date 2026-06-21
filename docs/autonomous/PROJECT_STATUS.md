# プロジェクト標準仕様（完成状態）

**最終更新:** 2026-06-21  
**対象:** TiSLY Practical PWA（現調 v1 / 見積 v1 / 日程 v1 / 持ち物 v1 / 発注 v1 / 到着・作業完了 v1 / 書類閲覧 UX v1 / Knowledge Acquisition v1）

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
| 設定（管理者） | `/settings-v1` |
| ナレッジ検索 | `/knowledge-search-v1` |
| 現場ナレッジ | `/knowledge-field-v1` |
| ナレッジ詳細 | `/knowledge-detail-v1?id=` |
| ストレージ設定 | `/storage-settings-v1` |
| 見積マスター | `/master-v1` |
| AI見積エンジン基盤 | `/ai-estimate-engine-v1` → `/master-v1?tab=stats` |
| 現調図面 | `/survey-drawing-v1` |

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
| NAS | TiSLYNAS · `192.168.1.10` · `\\192.168.1.10\TiSLY` |
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

---

## 関連ドキュメント

- [CURSOR_SELF_DRIVE_RULES.md](./CURSOR_SELF_DRIVE_RULES.md) — 自走時の行動規範
- [checklists/REGRESSION_TEST.md](./checklists/REGRESSION_TEST.md) — 回帰テスト項目
- [examples/EXAMPLE_INDEX.md](./examples/EXAMPLE_INDEX.md) — お手本カテゴリ索引
- [templates/NEXT_CURSOR_PROMPT.md](./templates/NEXT_CURSOR_PROMPT.md) — 次回作業用プロンプト雛形

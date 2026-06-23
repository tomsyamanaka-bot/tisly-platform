# Phase 完了ログ

## 実運用 Phase17 — PDF・図面・URL安定化（2026-06-24）

### 完了

- [x] PDF画面 LINE送信廃止（document-viewer · 見積クイック共有削除）
- [x] 書類閲覧戻る → `returnUrl` 優先 · 無ければ `/document-center-v1`
- [x] 見積/請求 右上メタ欄アンダーライン（画面 + PDF v2）
- [x] 方眼紙キャンバス全面描画（`syncGridStageSize` · drawing-ui-v5）
- [x] 旧URLリダイレクト固定（`/purchase` 追加含む）
- [x] `docs/routes/ROUTE_CONTRACT.md` 新規
- [x] route-health Phase17 診断 · SW v2400 · 更新ボタン常設
- [x] `operational-phase17-v1.test.ts`（17ケース）

## 実案件完走 Phase16（2026-06-23）

### 完了

- [x] Phase16-1 案件ステータス自動化（現調/見積/請求/完了報告保存時）
- [x] Phase16-2 不足一覧（案件詳細）
- [x] Phase16-3 案件利益計算（仮粗利）
- [x] Phase16-4 案件 PDF センター
- [x] Phase16-5 守谷市実案件フルフローテスト
- [x] `operational-phase16-v1.test.ts` · `operational-phase16-simulation.mjs`

## Phase B — 実務 PWA ナビ・スマホ確認（2026-06-08）

### 完了

- [x] 共通ナビ `tisly-practical-nav.js` / `.css` — 戻る・進む・アプリ一覧・下部タブ
- [x] `/app` — 「今日使うアプリ」セクション、現調・見積カードを強調表示
- [x] `/survey-v1` — 共通ナビ統合、`?project=` で現調詳細へ直接遷移
- [x] `/estimate-v1` — 共通ナビ統合、現調元へのリンク追加
- [x] 未実装アプリは「準備中」表示に統一
- [x] テスト survey-v1 / estimate-v1 / multi-pwa-app-hub 実行

### 仮値で進めたもの

- 作業報告・顧客管理・在庫管理（下部ナビは表示、タップで「準備中」）
- TOMS フォーマット出力（スタブ JSON）

### 次 Phase への引き継ぎ

- オフライン同期は未着手
- iPhone ホーム画面追加の実機確認は人間 TODO

## Phase A — 実務 PWA 基盤（2026-06-08）

### 完了

- [x] `docs/autonomous/` 自走管理フォルダー標準を作成
- [x] UI_DESIGN_GUIDE — 一般客向け画面ルールを固定
- [x] App Hub `/app` — 実務 PWA 5カード（現調・見積・作業報告・顧客・在庫）
- [x] 共有 CSS `tisly-friendly-ui.css` 作成
- [x] 現調PWA v1 — カード中心 UI・やさしい文言
- [x] 見積PWA v1 — 明細カード・PDF プレビュー・TOMS 受け皿 UI
- [x] API `/api/pwa/hub` — `practicalApps` フィールド追加
- [x] テスト survey-v1 / estimate-v1 実行

### 仮値で進めたもの

- TOMS フォーマット出力（スタブ JSON）
- 作業報告・顧客管理・在庫管理（「次に作る」表示のみ）

### 次 Phase への引き継ぎ

- オフライン同期は未着手
- TOMS 本 API 接続は人間設定待ち

## 過去 Phase（参考）

| Phase | 内容 | 状態 |
|-------|------|------|
| Field Survey v1 | 現調 API + PWA 初版 | 完了 |
| Field Estimate v1 | 見積 API + PWA 初版 | 完了 |
| RC1-lite | 防犯デモライン | 保留 |

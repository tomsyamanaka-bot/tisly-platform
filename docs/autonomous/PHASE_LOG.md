# Phase 完了ログ

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

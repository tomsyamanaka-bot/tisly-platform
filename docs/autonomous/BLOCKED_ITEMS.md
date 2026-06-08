# ブロッカー一覧

## 現在のブロッカー

| 項目 | 理由 | 回避策 | 状態 |
|------|------|--------|------|
| TOMS AI 見積 API | 本番 API キー・仕様未確定 | `/api/estimate/v1/projects/:id/toms-format` スタブで UI 受け皿を用意 | 回避済み |
| Gmail 本番送信 | アプリパスワード未設定 | Mock モードで開発継続 | 回避済み |
| Web Push 本番 | VAPID 鍵未設定 | 通知 UI のみ先行実装 | 回避済み |
| better-sqlite3 全体テスト | Windows 環境でネイティブビルド問題の可能性 | 個別テスト（survey-v1, estimate-v1, multi-pwa-app-hub）を優先実行 | 回避済み |
| iPhone 実機 PWA 確認 | 開発者の実機操作が必要 | HUMAN_TODO に確認手順を記載 | 人間待ち |

## 解消待ち（人間アクション必要）

| 項目 | 必要なこと | 参照 |
|------|------------|------|
| SMTP 本番 | Gmail アプリパスワード設定 | [MANUAL_SETUP_REQUIRED.md](./MANUAL_SETUP_REQUIRED.md) |
| VAPID | `npm run vapid:setup` 実行 | 同上 |
| Google Calendar OAuth | Cloud Console でクライアント作成 | 同上 |
| JWT / 管理者 | 本番用シークレット生成 | 同上 |
| スマホ実機確認 | Safari でホーム画面追加・実務フロー確認 | [HUMAN_TODO.md](./HUMAN_TODO.md) |

## 過去に詰まったこと

| 日付 | 内容 | 解決方法 |
|------|------|----------|
| 2026-06 | Phase 7 と実務 PWA の優先度競合 | 実務 PWA を最優先に方針決定 |
| 2026-06 | 専門用語だらけの UI | UI_DESIGN_GUIDE 策定・文言置換 |
| 2026-06 | Safari に戻る/進むボタンがない | 共通ナビ `tisly-practical-nav` で画面上部に配置 |

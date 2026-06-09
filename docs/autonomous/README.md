# TiSLY 自走開発管理

Cursor が止まらずに開発を進めるための標準フォルダーです。

**長時間自走を始めるときは、この README の次に [PROJECT_STATUS.md](./PROJECT_STATUS.md) を必ず読んでください。**

## 使い方

| ファイル | いつ見るか |
|----------|------------|
| **[PROJECT_STATUS.md](./PROJECT_STATUS.md)** | **完成済み標準仕様（作業開始時に必読）** |
| [CURSOR_SELF_DRIVE_RULES.md](./CURSOR_SELF_DRIVE_RULES.md) | Cursor の自走行動規範・完了報告形式 |
| [checklists/REGRESSION_TEST.md](./checklists/REGRESSION_TEST.md) | 写真/PDF/日程変更後の回帰テスト |
| [examples/EXAMPLE_INDEX.md](./examples/EXAMPLE_INDEX.md) | UI・PDF のお手本コード索引 |
| [templates/NEXT_CURSOR_PROMPT.md](./templates/NEXT_CURSOR_PROMPT.md) | 次回作業用プロンプト雛形 |
| [DEVELOPMENT_QUEUE.md](./DEVELOPMENT_QUEUE.md) | 今どの Phase か、次に何を優先するか |
| [NEXT_ACTIONS.md](./NEXT_ACTIONS.md) | Cursor が次に自走できる作業リスト |
| [BLOCKED_ITEMS.md](./BLOCKED_ITEMS.md) | 詰まっていることと回避策 |
| [HUMAN_ACTIONS.md](./HUMAN_ACTIONS.md) | **人間が後で設定するキー・OAuth（実務 PWA 向け一覧）** |
| [MANUAL_SETUP_REQUIRED.md](./MANUAL_SETUP_REQUIRED.md) | 人間が後で設定するキー・認証情報 |
| [SYSTEM_MAP.md](./SYSTEM_MAP.md) | PWA / API / DB / インフラの接続図 |
| [UI_DESIGN_GUIDE.md](./UI_DESIGN_GUIDE.md) | 一般のお客様向け画面ルール |
| [PHASE_LOG.md](./PHASE_LOG.md) | Phase ごとの完了ログ |
| [HUMAN_TODO.md](./HUMAN_TODO.md) | 智紀さん専用の短い ToDo |
| [VPS_AUTO_DEPLOY.md](./VPS_AUTO_DEPLOY.md) | GitHub push → VPS 自動デプロイの設定 |

## 方針

- 不明点で止まらない → 仮値で進める
- 専門用語を避ける → カード・アイコン・写真を優先
- 人間が必要な設定だけ [MANUAL_SETUP_REQUIRED.md](./MANUAL_SETUP_REQUIRED.md) に集約
- 実務 PWA（現調 v1・見積 v1）を最優先

## 関連

- ルートの手動設定一覧: [../manual-setup-required.md](../manual-setup-required.md)
- 現調PWA v1: [../field-survey-pwa-v1/README.md](../field-survey-pwa-v1/README.md)
- 見積PWA v1: [../field-estimate-pwa-v1/README.md](../field-estimate-pwa-v1/README.md)

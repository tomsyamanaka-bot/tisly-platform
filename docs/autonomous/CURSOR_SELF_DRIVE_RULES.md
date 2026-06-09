# Cursor 長時間自走ルール

TiSLY Practical PWA を Cursor が止まらずに開発・デプロイするための **必須行動規範** です。

---

## 作業開始時（必須）

1. **[PROJECT_STATUS.md](./PROJECT_STATUS.md) を最初に読む**
   - 完成済み機能・壊してはいけない仕様を把握する
   - 写真/PDF/日程の分離ルールを確認する
2. [CURRENT_STATUS.md](./CURRENT_STATUS.md) で直近の作業履歴を確認
3. [BLOCKED_ITEMS.md](./BLOCKED_ITEMS.md) / [HUMAN_TODO.md](./HUMAN_TODO.md) で人間待ちがないか確認

---

## 実装中の原則

### 既存完成機能を壊さない

- 現調写真と完了報告書用写真の **分離** を維持する
- 仕様書 PDF は現調写真のみ、完了報告書 PDF は完了報告書用写真のみ
- 見積書・請求書に写真を載せない
- 日程の日付メモ（`detail_memo`）と現場不可（`reason`）を混同しない

### 写真系・PDF系・日程系は必ず回帰テスト

変更を入れたら [checklists/REGRESSION_TEST.md](./checklists/REGRESSION_TEST.md) の該当項目を実行する。

```bash
cd server
npm run build
npx tsx --test test/survey-v1.test.ts
npx tsx --test test/estimate-v1.test.ts
npx tsx --test test/schedule-v1.test.ts
npx tsx --test test/practical-pwa-v2.test.ts
```

### VPS 反映は GitHub Actions 前提

- 通常: `git commit` → `git push origin master` で自動デプロイ
- **VPS への手動 SSH デプロイは不要**（Actions が成功した場合）
- 失敗時のみ [VPS_AUTO_DEPLOY.md](./VPS_AUTO_DEPLOY.md) を参照し、ログを調査する
- **失敗した場合だけ** 人間に操作依頼する（Secrets 未設定、SSH 鍵、本番のみの障害など）

### 人間に聞く前に自走調査

- ログ・テスト失敗メッセージ・`PROJECT_STATUS.md`・[examples/EXAMPLE_INDEX.md](./examples/EXAMPLE_INDEX.md) を先に確認
- 仮値・モックで進められる場合は止まらず進める（[MANUAL_SETUP_REQUIRED.md](./MANUAL_SETUP_REQUIRED.md) に記録）

---

## 作業完了時（必須報告）

作業を終えたら、チャットまたは PHASE_LOG に以下を **必ず** 記載する。

| 項目 | 内容 |
|------|------|
| **実装内容** | 何を変更したか（ファイル・機能単位） |
| **テスト結果** | `npm run build` および関連テストの成否 |
| **commit hash** | `git log -1 --oneline` の結果 |
| **VPS 反映確認 URL** | https://tisly.jp/api/health の `commitShort` 一致可否 |

### 報告テンプレ（コピー用）

```
## 完了報告

### 実装内容
- （箇条書き）

### テスト結果
- npm run build: OK / NG
- survey-v1 / estimate-v1 / schedule-v1 / practical-pwa-v2: OK / NG

### commit
- `<hash>` `<message>`

### VPS 反映
- GitHub Actions VPS Auto Deploy: 成功 / 失敗 / 未 push
- https://tisly.jp/api/health commitShort: `xxxxxxx`（一致 / 不一致）
```

---

## 関連

- プロンプト雛形: [templates/NEXT_CURSOR_PROMPT.md](./templates/NEXT_CURSOR_PROMPT.md)
- Cursor ルール（IDE）: `.cursor/rules/tisly-self-drive.mdc`
- 入口: [README.md](./README.md)

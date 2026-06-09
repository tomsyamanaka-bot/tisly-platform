# 次回 Cursor 作業プロンプト（テンプレート）

智紀さんがそのままコピーして使える指示雛形です。`（　）` 内を埋めてチャットに貼り付けてください。

---

## コピー用プロンプト

```
TiSLY Practical PWA — Cursor 自走作業

## 前提
- 作業開始前に必ず docs/autonomous/PROJECT_STATUS.md を読むこと
- VPS Auto Deploy は成功済み。master へ push すれば本番反映まで自動
- 現調写真と完了報告書用写真は別管理（混在禁止）
- 仕様書 PDF = 現調写真 / 完了報告書 PDF = 完了報告書用写真のみ
- 見積書・請求書 PDF には写真を載せない
- 日程詳細の日付メモ・Google カレンダー説明表示は完成済み（壊さない）

## やりたいこと
（ここに具体的な目的を書く。例: 見積 PWA の〇〇ボタンを追加）

## 触っていい場所
（例: server/public/js/estimate-v1.js, server/src/estimate/ 配下）

## 壊してはいけない機能
- 現調写真 / 完了報告書用写真の分離
- 各 PDF の写真有無ルール（仕様書・完了報告書のみ写真あり）
- 日程日付メモ（detail_memo）と現場不可の分離
- Google カレンダー説明の表示
- VPS 自動デプロイフロー

## テスト
作業後、必ず以下を実行:
cd server
npm run build
npx tsx --test test/survey-v1.test.ts
npx tsx --test test/estimate-v1.test.ts
npx tsx --test test/schedule-v1.test.ts
npx tsx --test test/practical-pwa-v2.test.ts

写真/PDF/日程を触った場合は docs/autonomous/checklists/REGRESSION_TEST.md の該当項目も確認。

## commit / push
- git add .（秘密情報・ローカル DB は含めない）
- git commit -m "（わかりやすいメッセージ）"
- git push origin master
- GitHub Actions VPS Auto Deploy の成功を確認

## 完了報告形式（必須）
作業完了時、以下を報告すること:
1. 実装内容（変更ファイル・機能）
2. テスト結果（build + 関連テスト）
3. commit hash
4. VPS 反映確認: https://tisly.jp/api/health の commitShort 一致可否
5. GitHub Actions が失敗した場合のみ、ログ要約と人間への依頼事項
```

---

## 参照リンク（Cursor 向け）

| ドキュメント | 用途 |
|-------------|------|
| [PROJECT_STATUS.md](../PROJECT_STATUS.md) | 完成仕様・壊してはいけないもの |
| [CURSOR_SELF_DRIVE_RULES.md](../CURSOR_SELF_DRIVE_RULES.md) | 自走行動規範 |
| [REGRESSION_TEST.md](../checklists/REGRESSION_TEST.md) | 回帰テスト |
| [EXAMPLE_INDEX.md](../examples/EXAMPLE_INDEX.md) | お手本コード索引 |
| [VPS_AUTO_DEPLOY.md](../VPS_AUTO_DEPLOY.md) | デプロイ失敗時 |

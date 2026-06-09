# 次回 Cursor 作業プロンプト

---

## コピー用プロンプト（次回）

```
TiSLY Practical PWA — Cursor 自走作業

## 前提
- docs/autonomous/README.md → PROJECT_STATUS.md → HUMAN_ACTIONS.md を読む
- VPS Auto Deploy 成功済み。master push で本番反映
- 現調写真 / 完了報告書用写真は別管理（混在禁止）
- Google Calendar・Maps は未設定でも mock / ナビのみで止まらない

## 次に進める候補（優先度順）
1. 日程調整モーダル内に当日予定一覧（title/start/end/location/description）を表示
2. 見積 PWA：案件ステータスフロー・請求連携の UX 改善
3. 現調 PWA：オフライン写真キュー・再送の安定化
4. PDF：写真の縦横判定でレイアウト最適化（object-fit 自動切替）
5. Google Calendar 本番 OAuth の VPS .env 反映後の E2E 確認

## 壊してはいけない機能
- 写真分離（現調 vs 完了報告書）
- PDF 写真有無ルール（仕様書・完了報告書のみ）
- 日程日付メモと現場不可の分離
- 移動時間ブロック・連携ステータスバッジ
- VPS 自動デプロイフロー

## テスト（必須）
cd server
npm run build
npx tsx --test test/survey-v1.test.ts
npx tsx --test test/estimate-v1.test.ts
npx tsx --test test/schedule-v1.test.ts
npx tsx --test test/practical-pwa-v2.test.ts

## commit / push
git add .（秘密・ローカル DB 除外）
git commit -m "（メッセージ）"
git push origin master

## 完了報告
1. 実装内容 2. テスト結果 3. commit hash
4. https://tisly.jp/api/health の commitShort 確認手順
5. 完了 / 未完了 / 人間がやること / 次に進めること
```

---

## 参照

| ドキュメント | 用途 |
|-------------|------|
| [PROJECT_STATUS.md](../PROJECT_STATUS.md) | 完成仕様 |
| [HUMAN_ACTIONS.md](../HUMAN_ACTIONS.md) | 人間が設定するキー |
| [REGRESSION_TEST.md](../checklists/REGRESSION_TEST.md) | 回帰テスト |

# 次に自走できる作業

Cursor が人間の確認なしで進められるタスクです。

## すぐ着手可能

- [ ] 現調PWA — 写真・部材の個別削除 UI
- [ ] 現調PWA — オフライン下書き（localStorage）
- [ ] 見積PWA — Puppeteer 本番 PDF 生成（HTML → PDF）
- [ ] 作業報告 PWA の画面モック（仮データ・カード UI）
- [ ] App Hub — surveyor 向け「今日のオペレーション」を折りたたみ化

## API・DB

- [ ] TOMS 出力 — `toms_export_log` テーブル（監査用）
- [ ] 見積確定時に TOMS プレビューを自動保存
- [ ] サーバー側サムネイル生成（sharp 導入検討）

## 本番反映後の確認（人間がデプロイしたら Cursor も再確認可）

- [ ] `curl -I https://tisly.jp/survey-v1` が 200
- [ ] iPhone で写真ライブラリ複数選択が動くか
- [ ] 見積 PDF プレビューが 401 にならないか
- [ ] [HUMAN_TODO.md](./HUMAN_TODO.md) のスマホチェックリスト

## テスト

```bash
cd server
npm run build
npx tsx --test test/survey-v1.test.ts
npx tsx --test test/estimate-v1.test.ts
npx tsx --test test/multi-pwa-app-hub.test.ts
```

## 完了したら記録

- [PHASE_LOG.md](./PHASE_LOG.md) に日付と内容を追記
- 人間設定が必要なら [HUMAN_TODO.md](./HUMAN_TODO.md) に追記

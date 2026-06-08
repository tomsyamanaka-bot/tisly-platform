# 次に自走できる作業

Cursor が人間の確認なしで進められるタスクです。

## すぐ着手可能

- [ ] 現調PWA v1 — 写真・部材の編集・削除 UI
- [ ] 現調PWA v1 — オフライン下書き（localStorage）
- [ ] 見積PWA v1 — 確定前でも PDF ドラフトプレビュー
- [ ] 作業報告 PWA の画面モック（仮データ・カード UI）
- [ ] 共有 CSS を business / survey（レガシー）へ展開
- [ ] App Hub — surveyor 向け「今日のオペレーション」を折りたたみ化

## API・DB（仮値 OK）

- [ ] TOMS 出力 — `toms_export_log` テーブル（監査用）
- [ ] 見積確定時に TOMS プレビューを自動保存
- [ ] 部材マスタの仮シードデータ

## 本番反映後の確認（人間がデプロイしたら）

- [ ] `curl -I https://tisly.jp/survey-v1` が 200
- [ ] 本番で部材カード「アンテナ」が追加できるか
- [ ] 見積 PDF が iPhone で表示できるか

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
- 人間設定が必要なら [MANUAL_SETUP_REQUIRED.md](./MANUAL_SETUP_REQUIRED.md) に追記

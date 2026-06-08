# 次に自走できる作業

Cursor が人間の確認なしで進められるタスクです。

## ブロック中（人間の VPS デプロイ待ち）

- [ ] 本番 `29d58cf` 反映後の curl / iPhone 再確認
- [ ] 本番で PDF Unauthorized・写真追加・ナビ遷移の実機検証
- [ ] `/api/health` の commitShort が `29d58cf` 系になることの確認

## すぐ着手可能（デプロイ不要）

- [ ] **見積・請求検索PWA** — `search_index_json` 横断検索 UI
- [ ] 日程調整 — Google Calendar API 本接続（OAuth 取得後）
- [ ] 見積PWA — Puppeteer 本番 PDF 生成
- [ ] 現調PWA — 写真・部材の個別削除 UI
- [ ] 現調PWA — オフライン下書き（localStorage）
- [ ] 作業報告 PWA の画面モック
- [ ] App Hub — surveyor 向け「今日のオペレーション」折りたたみ

## API・DB

- [ ] TOMS 出力 — `toms_export_log` テーブル
- [ ] 見積確定時に TOMS プレビュー自動保存
- [ ] サーバー側サムネイル生成（sharp 検討）

## テスト（ローカル — 現状 PASS）

```bash
cd server
npm run build
npx tsx --test test/schedule-v1.test.ts
npx tsx --test test/survey-v1.test.ts
npx tsx --test test/estimate-v1.test.ts
npx tsx --test test/multi-pwa-app-hub.test.ts
```

## 完了したら記録

- [PHASE_LOG.md](./PHASE_LOG.md) に日付と内容を追記
- 人間設定が必要なら [HUMAN_TODO.md](./HUMAN_TODO.md) に追記

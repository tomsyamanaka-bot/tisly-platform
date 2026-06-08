# 次に自走できる作業

Cursor が人間の確認なしで進められるタスクです。

## すぐ着手可能

- [ ] 現調PWA v1 — 写真・部材の編集・削除 UI
- [ ] 見積PWA v1 — PDF プレビューを画面内 iframe で表示（確定後の自動表示は実装済み）
- [ ] 共有 CSS `tisly-friendly-ui.css` を他 PWA（business, survey）へ展開
- [ ] 作業報告 PWA の画面モック（仮データ・カード UI のみ）
- [ ] App Hub — surveyor ロール向けにデプロイ系カードを非表示化
- [ ] 現調PWA — 音声メモの DB テーブル追加（UI は後回し可）
- [ ] 共通ナビ `tisly-practical-nav` を作業報告・顧客・在庫 PWA 追加時に再利用

## API・DB（仮値 OK）

- [ ] TOMS 出力 — `toms_export_log` テーブル追加（監査用）
- [ ] 見積確定時に TOMS プレビューを自動保存
- [ ] 部材マスタの仮シードデータ投入

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

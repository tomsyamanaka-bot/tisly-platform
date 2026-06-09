# 回帰テストチェックリスト

写真系・PDF系・日程系を変更したら、作業完了前に以下を確認してください。  
自動テストでカバーできる項目はコマンドも併記しています。

---

## 写真 — 現調

- [ ] 現調写真を追加できる（現調 PWA `/survey-v1`）
- [ ] 現調写真タイトルを保存できる（blur / 保存後に再表示で維持）
- [ ] 仕様書 PDF に現調写真が出る（完了報告書用写真は出ない）
- [ ] 自動: `cd server && npx tsx --test test/survey-v1.test.ts`

---

## 写真 — 完了報告書

- [ ] 完了報告書用写真を追加できる（見積 PWA、写真ライブラリ複数選択）
- [ ] タイトル保存・サムネ表示・タップ拡大・削除が動く
- [ ] 完了報告書 PDF に完了報告書用写真 **だけ** が出る（現調写真は出ない）
- [ ] 自動: `cd server && npx tsx --test test/estimate-v1.test.ts`（completion-photos / PDF セクション）

---

## PDF — 見積・請求（写真なし）

- [ ] 見積書 PDF に写真が出ない
- [ ] 請求書 PDF に写真が出ない
- [ ] 左右分割ヘッダ（宛名左・会社情報右）が崩れていない
- [ ] 自動: `cd server && npx tsx --test test/toms-estimate-format.test.ts`

---

## 日程・Google カレンダー

- [ ] 日程詳細の日付メモが保存される（再読み込み後も維持、現場不可と別）
- [ ] Google カレンダー予定の説明が表示される（展開/折りたたみ）
- [ ] 自動: `cd server && npx tsx --test test/schedule-v1.test.ts`
- [ ] 自動: `cd server && npx tsx --test test/practical-pwa-v2.test.ts`

---

## ビルド・総合

- [ ] `cd server && npm run build` 成功
- [ ] 上記関連テストがすべて成功

一括実行例:

```bash
cd server
npm run build
npx tsx --test test/survey-v1.test.ts test/estimate-v1.test.ts test/schedule-v1.test.ts test/practical-pwa-v2.test.ts test/toms-estimate-format.test.ts
```

---

## デプロイ（push 後）

- [ ] `git push origin master` 後、GitHub Actions **VPS Auto Deploy** が成功
- [ ] https://tisly.jp/api/health の `commitShort` が push した commit の先頭 7 文字と一致
- [ ] Actions 失敗時のみ: [VPS_AUTO_DEPLOY.md](../VPS_AUTO_DEPLOY.md) に従い調査し、必要なら人間に依頼

---

## 記録

回帰テスト実施後、作業報告に以下を含める:

- 実施したチェック項目（手動 / 自動）
- 失敗した項目と対応内容
- commit hash
- VPS health URL 確認結果

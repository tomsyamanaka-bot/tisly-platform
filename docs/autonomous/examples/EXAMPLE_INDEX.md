# お手本カテゴリ索引

Cursor が実装・修正する際の **参照お手本** です。新規 UI / PDF 変更時は、該当カテゴリの既存コードを読んでから着手してください。

---

## 1. 完了報告書用写真 UI

**仕様:** 現調写真とは別テーブル。ライブラリ複数選択、タイトル、サムネ、タップ拡大、削除、PDF 反映。

| 種類 | パス |
|------|------|
| フロント UI | `server/public/js/estimate-v1.js`（`completionPhotos`, `uploadCompletionPhotos`, `renderCompletionPhotos`） |
| HTML | `server/public/estimate-v1.html` |
| API | `server/src/api/routes/estimate-v1.ts`（`/completion-photos` 系） |
| Store | `server/src/estimate/completion-photos-store.ts` |
| テスト | `server/test/estimate-v1.test.ts`（completion-photos セクション） |

---

## 2. 仕様書 PDF レイアウト

**仕様:** 現調写真のみ。上部余白削減、案件情報コンパクト、写真タイトルは写真下中央、2列×4段。

| 種類 | パス |
|------|------|
| テンプレート | `server/src/estimate/specification-template.ts` |
| 写真取得 | `server/src/estimate/estimate-v1-store.ts` → `buildReportPhotosV1()` |
| HTML サンプル | `server/data/pdf-layout-samples/before-specification.html` |
| テスト | `server/test/estimate-v1.test.ts`（仕様書 PDF 関連） |

---

## 3. 完了報告書 PDF レイアウト

**仕様:** 完了報告書用写真のみ。写真優先、上部余白削減。

| 種類 | パス |
|------|------|
| テンプレート | `server/src/estimate/practical-completion-report-template.ts` |
| 写真取得 | `server/src/estimate/estimate-v1-store.ts` → `buildCompletionPhotosV1()` |
| HTML サンプル | `server/data/pdf-layout-samples/before-completion-report.html` |
| テスト | `server/test/estimate-v1.test.ts`（完了報告書 PDF 関連） |

---

## 4. 日程詳細メモ UI

**仕様:** 日付メモ（`detail_memo`）は現場不可（`reason`）と別。blur / debounce 保存。

| 種類 | パス |
|------|------|
| 日詳細 UI | `server/public/js/schedule-day-v1.js` |
| HTML | `server/public/schedule-day-v1.html` |
| Store | `server/src/schedule/schedule-store.ts` |
| テスト | `server/test/schedule-v1.test.ts`（日付メモ保存・取得） |

---

## 5. Google カレンダー説明表示

**仕様:** 予定の description を一覧・日詳細で折りたたみ表示。未設定時は非表示。

| 種類 | パス |
|------|------|
| 月間一覧 | `server/public/js/schedule-v1.js` |
| 日詳細 | `server/public/js/schedule-day-v1.js` |
| カレンダー取得 | `server/src/services/googleCalendar.ts` |
| テスト | `server/test/practical-pwa-v2.test.ts`（カテゴリ自動判定等） |

---

## 6. 請求書 / 見積書の左右分割レイアウト

**仕様:** TOMS 形式。左に宛名・件名、右に発行日・番号・会社情報。**写真なし。**

| 種類 | パス |
|------|------|
| 共通ヘッダ（左右分割） | `server/src/business/pdf/shared-blocks.ts` → `renderTomsDocLayoutHeader()` |
| 見積書 | `server/src/business/pdf/estimate-template.ts` |
| 請求書 | `server/src/business/pdf/invoice-template.ts` |
| スタイル | `server/src/business/pdf/styles.ts` |
| テスト | `server/test/toms-estimate-format.test.ts`, `server/test/estimate-v1.test.ts` |

---

## サンプルデータ置き場

| 用途 | パス |
|------|------|
| PDF レイアウト HTML スナップショット | `server/data/pdf-layout-samples/` |
| 回帰スナップショット | `server/src/business/pdf/regression-snapshot.ts` |

新しいお手本 HTML を追加する場合は `server/data/pdf-layout-samples/` に置き、この索引に行を追記してください。

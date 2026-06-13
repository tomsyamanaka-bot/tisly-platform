# 案件 PDF 保存仕様（固定版）

**最終更新:** 2026-06-13  
**対象:** TiSLY Practical PWA — 案件詳細の見積書・請求書・報告書 PDF

本仕様は **ローカル PDF 保存を完成版** として固定する。QNAP 自動バックアップは次フェーズで追加する（[qnap-pdf-backup-plan.md](./qnap-pdf-backup-plan.md) 参照）。

---

## PDF 保存先

```
uploads/business/{projectId}/pdfs/
```

- サーバー上の物理パス: `{process.cwd()}/uploads/business/{projectId}/pdfs/`
- 公開 URL パス: `/uploads/business/{projectId}/pdfs/{fileName}`
- 実装: `server/src/projects/project-pdf-store.ts` の `projectPdfStorageDir()`

---

## ファイル種別（命名規則）

| 種別 | ファイル名 | 例 |
|------|------------|-----|
| 見積書 | `estimate-{番号}.pdf` | `estimate-EST-2026-0001.pdf` |
| 請求書 | `invoice-{番号}.pdf` | `invoice-INV-2026-0042.pdf` |
| 報告書 | `report-{タイトル}.pdf` | `report-完了報告.pdf` |

- `{番号}` は見積番号 / 請求番号（`estimate_no` / `invoice_no`）
- `{タイトル}` は完了報告書タイトル（最大 24 文字、ファイル名禁止文字は `_` に置換）
- 実装: `buildProjectPdfFileName()` / `expectedStoragePath()`

---

## 保存方式

| 項目 | 仕様 |
|------|------|
| 一次保存 | **ローカル**（`uploads/business/{projectId}/pdfs/`） |
| PWA 表示 | **保存済み PDF を優先**（存在する場合は再生成しない） |
| 再生成 | **明示ボタン**（案件詳細「再生成」）を押したときのみ |
| 削除 | 案件詳細「削除」— ローカルファイル削除 + DB の `pdf_path` クリア |
| 復元 | 見積 PWA で PDF 生成、または案件詳細「再生成」 |

メタ情報は既存テーブルの `pdf_path` に保持:

- `business_estimates.pdf_path`
- `business_invoices.pdf_path`
- `business_completion_reports.pdf_path`

---

## 共有方式

| 環境 | 方式 |
|------|------|
| iPhone Safari / PWA | **Web Share API**（`navigator.share`） |
| 非対応ブラウザ | **URL コピー**（クリップボード / `prompt` フォールバック） |

- 実装: `server/public/js/projects-v1.js` の `sharePdf()`
- メール送信は **標準では行わない**（Gmail 連携は別機能・手動運用）

---

## QNAP 連携（次フェーズ）

- **現状:** 未実装。ローカル PDF のみ。
- **予定:** 作成済み PDF を QNAP へ自動バックアップ（設計: [qnap-pdf-backup-plan.md](./qnap-pdf-backup-plan.md)）
- QNAP 未設定時は PWA に状態を出さず、内部ログのみ。

---

## API（案件 PDF v1）

| メソッド | パス | 用途 |
|----------|------|------|
| GET | `/api/projects/v1/projects/:id/pdfs` | 一覧 + 保存先 |
| GET | `/api/projects/v1/projects/:id/pdfs/:kind/file` | PDF ファイル取得 |
| POST | `/api/projects/v1/projects/:id/pdfs/:kind/regenerate` | 再生成 |
| DELETE | `/api/projects/v1/projects/:id/pdfs/:kind` | 削除 |

`kind`: `estimate` | `invoice` | `report`

---

## 関連コード

| 領域 | パス |
|------|------|
| PDF ストア | `server/src/projects/project-pdf-store.ts` |
| API ルート | `server/src/api/routes/projects-v1.ts` |
| 案件詳細 UI | `server/public/js/projects-v1.js` |
| PDF 生成 | `server/src/business/services/pdfService.ts` |
| テスト | `server/test/project-pdf-v1.test.ts` |

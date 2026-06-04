# 見積 PDF / QNAP mock 配置（Phase 981–1000）

## 生成

- `TISLY_PDF_PUPPETEER=true` かつ puppeteer 利用可能 → PDF バイナリ生成
- 未設定・失敗時 → HTML プレビュー（`/api/demo-kit/estimate-html/:type`）

## API

- `GET /api/demo-kit/sales-pdf/archive` — 種別ごと HTML/PDF URL と QNAP パス
- `/sales` の「PDF確認」ボタン

## 配置先

| 種別 | パス |
|------|------|
| 生成 PDF | `uploads/sales-demo/pdfs/EST-DEMO-{house\|minpaku\|factory}.pdf` |
| QNAP mock | `uploads/qnap-mock/SALES-DEMO/02_見積書/` |

Business 本番 PDF は従来どおり `uploads/business/{BIZ-id}/` および `uploads/qnap-mock/{BIZ-id}/`。

# Business PDF Templates

## 構造

- `server/src/business/services/pdf-templates.ts` — テンプレメタ・HTML placeholder
- `server/src/business/services/pdfService.ts` — 生成（簡易PDF + HTML）

## 取得 API

| ドキュメント | GET |
|--------------|-----|
| 見積 | `/api/business/projects/:id/estimate.pdf` |
| 請求 | `.../invoice.pdf` |
| 完了報告 | `.../completion-report.pdf` |

## 差し替え

`getPdfTemplateMeta().provider` を `toms_standard` にし、Puppeteer 等で HTML→PDF を生成する実装に置換。

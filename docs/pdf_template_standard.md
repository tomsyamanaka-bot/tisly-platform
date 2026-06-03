# TOMS 標準 PDF テンプレート v1

## 対象ドキュメント

| kind | HTML | PDF 出力 |
|------|------|----------|
| 見積 | `estimate-toms.html` | `pdfs/estimate-*.pdf` |
| 請求 | `invoice-toms.html` | `pdfs/invoice-*.pdf` |
| 完了報告 | `completion_report-toms.html` | `pdfs/completion_report-*.pdf` |
| 仕様書 | `specification-toms.html` | `specifications/*.pdf` |

## パイプライン

1. HTML preview（`pdf-html/`）
2. `TISLY_PDF_PUPPETEER=true` で Puppeteer PDF
3. 未導入時は `minimalPdfBuffer`（HTML fallback）
4. QNAP 保存は既存 `qnapBusinessArchive` 連携

## コード

- `server/src/business/pdf/render.ts` — `renderBusinessPdf`, `renderSpecificationPdf`, `runUnifiedPdfPipeline`
- 連携ログに `dryRun` / `mockOnly` / `realSend` を記録

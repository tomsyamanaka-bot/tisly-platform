# TOMS標準PDF v2

テンプレ: `server/src/business/pdf/`（`toms_standard_v2`）

## 含まれる要素

- TOMS 会社情報（env: `TOMS_COMPANY_*`）
- 顧客名・件名・明細・税区分列
- 備考・参考写真
- 振込先 + **振込QR placeholder**
- **印影 placeholder**

## 出力

- `GET /api/business/projects/:id/pdf/estimate|invoice|completion-report`
- `TISLY_PDF_PUPPETEER=true` かつ puppeteer 利用可 → PDF
- それ以外 → HTML（Accept: application/pdf で PDF 返却試行）

real PDF 生成は settings の real送信ガード対象。

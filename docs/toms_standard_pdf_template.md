# TOMS Standard PDF Template

## 配置

`server/src/business/pdf/`

- `estimate-template.ts` — 見積
- `invoice-template.ts` — 請求
- `completion-report-template.ts` — 完了報告

会社情報は `TOMS_COMPANY_*` 環境変数（`pdf/company.ts`）。

## API

| GET | 説明 |
|-----|------|
| `/api/business/projects/:id/pdf/estimate` | HTML（Accept: pdf で PDF） |
| `/api/business/projects/:id/pdf/invoice` | 同上 |
| `/api/business/projects/:id/pdf/completion-report` | 同上 |

`TISLY_PDF_PUPPETEER=true` かつ puppeteer 導入時は PDF バイナリ生成。

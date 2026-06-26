import type { BusinessProject, CompletionReport, Estimate, Invoice } from "../business-types.js";

export type PdfDocumentKind = "estimate" | "invoice" | "completion_report";

export interface PdfTemplateMeta {
  id: PdfDocumentKind;
  version: string;
  provider: "placeholder" | "toms_standard";
  description: string;
}

const TEMPLATES: Record<PdfDocumentKind, PdfTemplateMeta> = {
  estimate: {
    id: "estimate",
    version: "v2-excel",
    provider: "toms_standard",
    description: "TOMS Excel帳票風見積書（pdf-base-template + toms-excel-doc-layout-v2）",
  },
  invoice: {
    id: "invoice",
    version: "v2-excel",
    provider: "toms_standard",
    description: "TOMS Excel帳票風請求書（pdf-base-template + toms-excel-doc-layout-v2）",
  },
  completion_report: {
    id: "completion_report",
    version: "practical-v1",
    provider: "toms_standard",
    description: "実務PWA完了報告書（practical-pdf-layout + pdf-base-template）",
  },
};

export function getPdfTemplateMeta(kind: PdfDocumentKind): PdfTemplateMeta {
  return TEMPLATES[kind];
}

export function renderPdfPlaceholderHtml(
  kind: PdfDocumentKind,
  project: BusinessProject,
  doc: Estimate | Invoice | CompletionReport
): string {
  const meta = getPdfTemplateMeta(kind);
  const title =
    kind === "estimate"
      ? `見積書 ${(doc as Estimate).estimateNo}`
      : kind === "invoice"
        ? `請求書 ${(doc as Invoice).invoiceNo}`
        : `完了報告 ${(doc as CompletionReport).title}`;
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/><title>${title}</title>
<style>body{font-family:sans-serif;padding:2rem;max-width:720px;margin:auto}
header{border-bottom:2px solid #0d9488;padding-bottom:1rem;margin-bottom:1.5rem}
.meta{color:#64748b;font-size:0.9rem}.badge{display:inline-block;background:#ccfbf1;color:#0f766e;padding:0.2rem 0.6rem;border-radius:4px;font-size:0.75rem}
</style></head><body>
<header><h1>${title}</h1><p class="meta">${project.customerName} — ${project.title}</p>
<span class="badge">${meta.provider} v${meta.version}</span></header>
<p>住所: ${project.address || "—"}</p>
<p>案件番号: ${project.projectNo}</p>
<p>${meta.description}</p>
<p>Phase541–560 placeholder — Puppeteer / TOMS標準PDF 差し替え予定</p>
</body></html>`;
}

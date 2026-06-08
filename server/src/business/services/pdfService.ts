import fs from "fs";
import path from "path";
import type { BusinessProject, CompletionReport, Estimate, Invoice } from "../business-types.js";
import { businessUploadsDir } from "../business-store.js";
import { generateQnapFilePath } from "./qnapService.js";
import {
  getPdfTemplateMeta,
  renderPdfPlaceholderHtml,
  type PdfDocumentKind,
} from "./pdf-templates.js";
import { renderEstimateHtml } from "./estimatePdfTemplate.js";
import { renderInvoiceHtml } from "./invoicePdfTemplate.js";
import type { TomsEstimateHeader } from "../toms-document-format.js";
/** Phase601+ v3: HTML templates live in estimatePdfTemplate / invoicePdfTemplate / completionReportPdfTemplate */

function minimalPdfBuffer(title: string, lines: string[]): Buffer {
  const text = [title, "", ...lines].join("\n");
  const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const stream = `BT /F1 12 Tf 50 750 Td (${escaped.slice(0, 500)}) Tj ET`;
  const pdf = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>endobj
4 0 obj<< /Length ${stream.length} >>stream
${stream}
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
trailer<< /Size 5 /Root 1 0 R >>
startxref
400
%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function writePdf(projectId: string, folder: string, fileName: string, buf: Buffer): string {
  const dir = businessUploadsDir(projectId, folder);
  const full = path.join(dir, fileName);
  fs.writeFileSync(full, buf);
  return `/uploads/business/${projectId}/${folder}/${fileName}`;
}

function writeHtml(projectId: string, folder: string, fileName: string, html: string): string {
  const dir = businessUploadsDir(projectId, folder);
  const full = path.join(dir, fileName);
  fs.writeFileSync(full, html, "utf8");
  return `/uploads/business/${projectId}/${folder}/${fileName}`;
}

function renderWithTemplate(
  kind: PdfDocumentKind,
  project: BusinessProject,
  doc: Estimate | Invoice | CompletionReport,
  pdfLines: string[]
): { pdfPath: string; htmlPath: string; template: ReturnType<typeof getPdfTemplateMeta> } {
  const meta = getPdfTemplateMeta(kind);
  const html = renderPdfPlaceholderHtml(kind, project, doc);
  const htmlName = `${kind}-placeholder.html`;
  const htmlPath = writeHtml(project.id, "pdf-html", htmlName, html);
  const fileName = path.basename(
    generateQnapFilePath(
      project,
      kind === "completion_report" ? "completion_report" : kind,
      kind === "estimate"
        ? (doc as Estimate).estimateNo
        : kind === "invoice"
          ? (doc as Invoice).invoiceNo
          : undefined
    )
  );
  const pdfPath = writePdf(
    project.id,
    "pdfs",
    fileName,
    minimalPdfBuffer(meta.description, [...pdfLines, `template: ${meta.provider}/${meta.version}`])
  );
  return { pdfPath, htmlPath, template: meta };
}

export function generateEstimatePdf(
  project: BusinessProject,
  estimate: Estimate,
  ctx?: EstimatePdfRenderContext
): string {
  const html = renderEstimateHtml(project, estimate, {
    siteName: ctx?.siteName,
    workLocation: ctx?.workLocation,
    staffName: ctx?.staffName,
    notes: ctx?.notes,
    header: ctx?.header ?? estimate.header,
    includePhotos: ctx?.includePhotos,
  });
  const htmlPath = writeHtml(project.id, "pdf-html", `estimate-${estimate.estimateNo}.html`, html);
  const { pdfPath } = renderWithTemplate("estimate", project, estimate, [
    `見積書 ${estimate.estimateNo}`,
    `お客様: ${estimate.customerName}`,
    `件名: ${estimate.title}`,
    `小計: ¥${estimate.subtotal}`,
    `税: ¥${estimate.tax}`,
    `合計: ¥${estimate.total}`,
    `粗利: ¥${estimate.grossProfit} (${estimate.grossProfitRate}%)`,
    `html: ${htmlPath}`,
  ]);
  return pdfPath;
}

export function generateInvoicePdf(
  project: BusinessProject,
  invoice: Invoice,
  estimate: Estimate
): string {
  const html = renderInvoiceHtml(project, invoice, estimate, {
    estimateRefNo: invoice.estimateRefNo ?? estimate.estimateNo,
  });
  const htmlPath = writeHtml(project.id, "pdf-html", `invoice-${invoice.invoiceNo}.html`, html);
  const { pdfPath } = renderWithTemplate("invoice", project, invoice, [
    `御請求書 ${invoice.invoiceNo}`,
    `お客様: ${invoice.customerName}`,
    `件名: ${invoice.title}`,
    `見積参照: ${invoice.estimateRefNo ?? estimate.estimateNo}`,
    `合計: ¥${invoice.total}`,
    `支払期限: ${invoice.paymentDueDate ?? ""}`,
    invoice.bankInfo,
    `html: ${htmlPath}`,
  ]);
  return pdfPath;
}

export function generateCompletionReportPdf(
  project: BusinessProject,
  report: CompletionReport
): string {
  const { pdfPath } = renderWithTemplate("completion_report", project, report, [
    `完了報告 ${report.title}`,
    `案件: ${project.title}`,
    `お客様: ${project.customerName}`,
    report.workMemo,
    `施工前写真: ${report.beforePhotos.length}枚`,
    `施工後写真: ${report.afterPhotos.length}枚`,
  ]);
  return pdfPath;
}

export interface EstimatePdfRenderContext {
  siteName?: string | null;
  workLocation?: string | null;
  customerAddress?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  staffName?: string | null;
  notes?: string | null;
  header?: TomsEstimateHeader | null;
  includePhotos?: boolean;
}

export function getEstimatePdfOrPlaceholder(
  project: BusinessProject,
  estimate: Estimate,
  ctx?: EstimatePdfRenderContext
): { contentType: string; path: string } {
  if (estimate.pdfPath) {
    const local = path.join(process.cwd(), estimate.pdfPath.replace(/^\//, ""));
    if (fs.existsSync(local)) return { contentType: "application/pdf", path: local };
  }
  const html = renderEstimateHtml(project, estimate, {
    siteName: ctx?.siteName,
    workLocation: ctx?.workLocation ?? project.address,
    staffName: ctx?.staffName,
    notes: ctx?.notes,
    header: ctx?.header ?? estimate.header,
    includePhotos: ctx?.includePhotos,
  });
  const tmp = businessUploadsDir(project.id, "pdf-html");
  const p = path.join(tmp, "estimate-live.html");
  fs.writeFileSync(p, html);
  return { contentType: "text/html; charset=utf-8", path: p };
}

export function getInvoicePdfOrPlaceholder(
  project: BusinessProject,
  invoice: Invoice,
  estimate: Estimate
): { contentType: string; path: string } {
  if (invoice.pdfPath) {
    const local = path.join(process.cwd(), invoice.pdfPath.replace(/^\//, ""));
    if (fs.existsSync(local)) return { contentType: "application/pdf", path: local };
  }
  const html = renderInvoiceHtml(project, invoice, estimate, {
    estimateRefNo: invoice.estimateRefNo ?? estimate.estimateNo,
  });
  const tmp = businessUploadsDir(project.id, "pdf-html");
  const p = path.join(tmp, "invoice-live.html");
  fs.writeFileSync(p, html);
  return { contentType: "text/html; charset=utf-8", path: p };
}

export function getCompletionReportPdfOrPlaceholder(
  project: BusinessProject,
  report: CompletionReport
): { contentType: string; path: string } {
  if (report.pdfPath) {
    const local = path.join(process.cwd(), report.pdfPath.replace(/^\//, ""));
    if (fs.existsSync(local)) return { contentType: "application/pdf", path: local };
  }
  const html = renderPdfPlaceholderHtml("completion_report", project, report);
  const tmp = businessUploadsDir(project.id, "pdf-html");
  const p = path.join(tmp, "completion-report-live.html");
  fs.writeFileSync(p, html);
  return { contentType: "text/html; charset=utf-8", path: p };
}

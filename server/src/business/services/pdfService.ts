import fs from "fs";
import path from "path";
import type { BusinessProject, CompletionReport, Estimate, Invoice } from "../business-types.js";
import { resolveEstimatePriceRule } from "../customer-price-rules.js";
import { businessUploadsDir } from "../business-store.js";
import {
  buildProjectPdfFileName,
  PDF_STORAGE_PROVIDER,
  type PdfStorageProvider,
} from "../../projects/project-pdf-store.js";
import { generateQnapFilePath } from "./qnapService.js";
import {
  getPdfTemplateMeta,
  renderPdfPlaceholderHtml,
  type PdfDocumentKind,
} from "./pdf-templates.js";
import { renderEstimateHtml } from "./estimatePdfTemplate.js";
import { renderInvoiceHtml } from "./invoicePdfTemplate.js";
import { renderWithPdfFallback } from "../pdf/render.js";
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

/** @see PDF_STORAGE_PROVIDER — 現状 local 固定、将来 qnap 切替 */
export function getPdfStorageProvider(): PdfStorageProvider {
  return PDF_STORAGE_PROVIDER;
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

async function writePdfFromHtml(
  project: BusinessProject,
  kind: "estimate" | "invoice",
  doc: Estimate | Invoice,
  html: string,
  title: string
): Promise<{ pdfPath: string; htmlPath: string }> {
  const htmlName =
    kind === "estimate"
      ? `estimate-${(doc as Estimate).estimateNo}.html`
      : `invoice-${(doc as Invoice).invoiceNo}.html`;
  const htmlPath = writeHtml(project.id, "pdf-html", htmlName, html);
  const suffix =
    kind === "estimate"
      ? (doc as Estimate).estimateNo
      : (doc as Invoice).invoiceNo;
  const fileName = buildProjectPdfFileName(kind, suffix);
  const { pdfBuf } = await renderWithPdfFallback(html, title);
  const pdfPath = writePdf(project.id, "pdfs", fileName, pdfBuf);
  return { pdfPath, htmlPath };
}

export async function generateCompletionReportPdfV1(
  project: BusinessProject,
  html: string,
  suffix: string
): Promise<string> {
  const fileName = buildProjectPdfFileName("report", suffix);
  const { pdfBuf } = await renderWithPdfFallback(html, `完了報告 ${project.title}`);
  return writePdf(project.id, "pdfs", fileName, pdfBuf);
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

export async function generateEstimatePdf(
  project: BusinessProject,
  estimate: Estimate,
  ctx?: EstimatePdfRenderContext
): Promise<string> {
  const html = renderEstimateHtml(project, estimate, {
    siteName: ctx?.siteName,
    workLocation: ctx?.workLocation,
    staffName: ctx?.staffName,
    notes: ctx?.notes,
    header: ctx?.header ?? estimate.header,
    includePhotos: ctx?.includePhotos,
    priceRuleName: resolveEstimatePriceRule(estimate, project.customerId).ruleName,
  });
  const { pdfPath } = await writePdfFromHtml(
    project,
    "estimate",
    estimate,
    html,
    `見積 ${estimate.estimateNo}`
  );
  return pdfPath;
}

export interface InvoicePdfRenderContext {
  estimateRefNo?: string;
  notes?: string | null;
  includePhotos?: boolean;
}

export async function generateInvoicePdf(
  project: BusinessProject,
  invoice: Invoice,
  estimate: Estimate,
  ctx?: InvoicePdfRenderContext
): Promise<string> {
  const html = renderInvoiceHtml(project, invoice, estimate, {
    estimateRefNo: ctx?.estimateRefNo ?? invoice.estimateRefNo ?? estimate.estimateNo,
    notes: ctx?.notes,
    includePhotos: ctx?.includePhotos,
    priceRuleName: resolveEstimatePriceRule(estimate, project.customerId).ruleName,
    shuseiDiscount: estimate.shuseiDiscount,
    shuseiDiscountMemo: estimate.shuseiDiscountMemo,
    lineSubtotal: estimate.lineSubtotal,
  });
  const { pdfPath } = await writePdfFromHtml(
    project,
    "invoice",
    invoice,
    html,
    `請求 ${invoice.invoiceNo}`
  );
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

function resolveStoredPdfPath(storedPath: string | null | undefined): string | null {
  if (!storedPath?.trim()) return null;
  const local = path.join(process.cwd(), storedPath.replace(/^\//, ""));
  return fs.existsSync(local) ? local : null;
}

export interface PdfServeOptions {
  /** true = 保存済みPDFを無視してHTMLプレビューを生成 */
  regenerate?: boolean;
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
  ctx?: EstimatePdfRenderContext,
  opts?: PdfServeOptions
): { contentType: string; path: string; stored: boolean } {
  if (!opts?.regenerate) {
    const stored = resolveStoredPdfPath(estimate.pdfPath);
    if (stored) return { contentType: "application/pdf", path: stored, stored: true };
  }
  const html = renderEstimateHtml(project, estimate, {
    siteName: ctx?.siteName,
    workLocation: ctx?.workLocation ?? project.address,
    staffName: ctx?.staffName,
    notes: ctx?.notes,
    header: ctx?.header ?? estimate.header,
    includePhotos: ctx?.includePhotos,
    priceRuleName: resolveEstimatePriceRule(estimate, project.customerId).ruleName,
  });
  const tmp = businessUploadsDir(project.id, "pdf-html");
  const p = path.join(tmp, "estimate-live.html");
  fs.writeFileSync(p, html, "utf8");
  return { contentType: "text/html; charset=UTF-8", path: p, stored: false };
}

export function getInvoicePdfOrPlaceholder(
  project: BusinessProject,
  invoice: Invoice,
  estimate: Estimate,
  ctx?: InvoicePdfRenderContext,
  opts?: PdfServeOptions
): { contentType: string; path: string; stored: boolean } {
  if (!opts?.regenerate) {
    const stored = resolveStoredPdfPath(invoice.pdfPath);
    if (stored) return { contentType: "application/pdf", path: stored, stored: true };
  }
  const html = renderInvoiceHtml(project, invoice, estimate, {
    estimateRefNo: ctx?.estimateRefNo ?? invoice.estimateRefNo ?? estimate.estimateNo,
    notes: ctx?.notes,
    includePhotos: ctx?.includePhotos,
    priceRuleName: resolveEstimatePriceRule(estimate, project.customerId).ruleName,
    shuseiDiscount: estimate.shuseiDiscount,
    shuseiDiscountMemo: estimate.shuseiDiscountMemo,
    lineSubtotal: estimate.lineSubtotal,
  });
  const tmp = businessUploadsDir(project.id, "pdf-html");
  const p = path.join(tmp, "invoice-live.html");
  fs.writeFileSync(p, html, "utf8");
  return { contentType: "text/html; charset=UTF-8", path: p, stored: false };
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

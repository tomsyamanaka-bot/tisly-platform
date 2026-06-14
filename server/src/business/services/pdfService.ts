import fs from "fs";
import path from "path";
import type { BusinessProject, CompletionReport, Estimate, Invoice } from "../business-types.js";
import { resolveEstimatePriceRule } from "../customer-price-rules.js";
import { businessUploadsDir, getEstimate } from "../business-store.js";
import {
  buildProjectPdfFileNameForProject,
  PDF_STORAGE_PROVIDER,
  type PdfStorageProvider,
} from "../../projects/project-pdf-store.js";
import { renderPdfPlaceholderHtml } from "./pdf-templates.js";
import { renderEstimateHtml } from "./estimatePdfTemplate.js";
import { renderInvoiceHtml } from "./invoicePdfTemplate.js";
import { renderWithPdfFallback } from "../pdf/render.js";
import { assertValidPdfBuffer } from "../pdf/pdf-validation.js";
import type { TomsEstimateHeader } from "../toms-document-format.js";
/** Phase601+ v3: HTML templates live in estimatePdfTemplate / invoicePdfTemplate / completionReportPdfTemplate */

/** @see PDF_STORAGE_PROVIDER — 現状 local 固定、将来 qnap 切替 */
export function getPdfStorageProvider(): PdfStorageProvider {
  return PDF_STORAGE_PROVIDER;
}

function writePdf(projectId: string, folder: string, fileName: string, buf: Buffer): string {
  assertValidPdfBuffer(buf);
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

function removeStoredPdfIfRenamed(
  oldStoredPath: string | null | undefined,
  newFileName: string
): void {
  if (!oldStoredPath?.trim()) return;
  const oldName = path.basename(oldStoredPath);
  if (oldName === newFileName) return;
  const oldLocal = path.join(process.cwd(), oldStoredPath.replace(/^\//, ""));
  if (fs.existsSync(oldLocal)) {
    try {
      fs.unlinkSync(oldLocal);
    } catch {
      /* ignore */
    }
  }
}

async function writePdfFromHtml(
  project: BusinessProject,
  kind: "estimate" | "invoice",
  doc: Estimate | Invoice,
  html: string,
  title: string,
  oldStoredPath?: string | null
): Promise<{ pdfPath: string; htmlPath: string }> {
  const htmlName =
    kind === "estimate"
      ? `estimate-${(doc as Estimate).estimateNo}.html`
      : `invoice-${(doc as Invoice).invoiceNo}.html`;
  const htmlPath = writeHtml(project.id, "pdf-html", htmlName, html);
  const estimate =
    kind === "estimate" ? (doc as Estimate) : project.estimateId ? getEstimate(project.estimateId) : null;
  const fileName = buildProjectPdfFileNameForProject(kind, project, estimate ?? undefined);
  removeStoredPdfIfRenamed(oldStoredPath, fileName);
  const { pdfBuf } = await renderWithPdfFallback(html, title);
  const pdfPath = writePdf(project.id, "pdfs", fileName, pdfBuf);
  return { pdfPath, htmlPath };
}

export async function generateCompletionReportPdfV1(
  project: BusinessProject,
  html: string,
  oldStoredPath?: string | null
): Promise<string> {
  const estimate = project.estimateId ? getEstimate(project.estimateId) : null;
  const fileName = buildProjectPdfFileNameForProject("report", project, estimate ?? undefined);
  removeStoredPdfIfRenamed(oldStoredPath, fileName);
  const { pdfBuf } = await renderWithPdfFallback(html, `完了報告 ${project.title}`);
  return writePdf(project.id, "pdfs", fileName, pdfBuf);
}

export async function generateSpecificationPdfV1(
  project: BusinessProject,
  html: string,
  oldStoredPath?: string | null
): Promise<string> {
  const estimate = project.estimateId ? getEstimate(project.estimateId) : null;
  const fileName = buildProjectPdfFileNameForProject("specification", project, estimate ?? undefined);
  removeStoredPdfIfRenamed(oldStoredPath, fileName);
  const { pdfBuf } = await renderWithPdfFallback(html, `仕様書 ${project.title}`);
  return writePdf(project.id, "pdfs", fileName, pdfBuf);
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
    priceRuleName: resolveEstimatePriceRule(estimate, project.customerId).ruleName,
  });
  const { pdfPath } = await writePdfFromHtml(
    project,
    "estimate",
    estimate,
    html,
    `見積 ${estimate.estimateNo}`,
    estimate.pdfPath
  );
  return pdfPath;
}

export interface InvoicePdfRenderContext {
  estimateRefNo?: string;
  notes?: string | null;
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
    `請求 ${invoice.invoiceNo}`,
    invoice.pdfPath
  );
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

import fs from "fs";
import path from "path";
import type { BusinessProject, CompletionReport, Estimate, Invoice } from "../business-types.js";
import { resolveEstimatePriceRule } from "../customer-price-rules.js";
import {
  businessUploadsDir,
  getBusinessProject,
  getEstimate,
  getInvoice,
} from "../business-store.js";
import {
  buildProjectPdfFileNameForProject,
  PDF_STORAGE_PROVIDER,
  type PdfStorageProvider,
} from "../../projects/project-pdf-store.js";
import { renderPdfPlaceholderHtml } from "./pdf-templates.js";
import { renderEstimateHtml } from "../pdf/estimate-template.js";
import { renderInvoiceHtml } from "../pdf/invoice-template.js";
import { renderWithPdfFallback } from "../pdf/render.js";
import { assertValidPdfBuffer } from "../pdf/pdf-validation.js";
import type { TomsEstimateHeader } from "../toms-document-format.js";
import {
  formatCustomerNameForPdfFile,
  sanitizePdfFileNameSegment,
} from "../../projects/project-pdf-store.js";

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
  // 呼び出し元の古いオブジェクトを使わず、常に DB 最新を再取得
  const freshProject = getBusinessProject(project.id) ?? project;
  const freshEstimate = getEstimate(estimate.id) ?? estimate;
  const html = renderEstimateHtml(freshProject, freshEstimate, {
    siteName: ctx?.siteName,
    workLocation: ctx?.workLocation,
    staffName: ctx?.staffName,
    notes: ctx?.notes,
    header: ctx?.header ?? freshEstimate.header,
    priceRuleName: resolveEstimatePriceRule(freshEstimate, freshProject.customerId).ruleName,
  });
  const { pdfPath } = await writePdfFromHtml(
    freshProject,
    "estimate",
    freshEstimate,
    html,
    `見積 ${freshEstimate.estimateNo}`,
    freshEstimate.pdfPath
  );
  return pdfPath;
}

export interface ReceiptPdfRenderContext extends EstimatePdfRenderContext {
  receiptDate?: string | null;
  proviso?: string | null;
}

/** 見積データを流用した領収書 PDF（別ファイル名で保存） */
export async function generateReceiptPdf(
  project: BusinessProject,
  estimate: Estimate,
  ctx?: ReceiptPdfRenderContext
): Promise<string> {
  const freshProject = getBusinessProject(project.id) ?? project;
  const freshEstimate = getEstimate(estimate.id) ?? estimate;
  const html = renderEstimateHtml(freshProject, freshEstimate, {
    siteName: ctx?.siteName,
    workLocation: ctx?.workLocation,
    staffName: ctx?.staffName,
    notes: ctx?.notes,
    header: ctx?.header ?? freshEstimate.header,
    priceRuleName: resolveEstimatePriceRule(freshEstimate, freshProject.customerId).ruleName,
    mode: "receipt",
    receiptDate: ctx?.receiptDate,
    proviso: ctx?.proviso,
  });
  const customer = formatCustomerNameForPdfFile(freshProject.customerName);
  const subject = sanitizePdfFileNameSegment(
    freshEstimate.header?.subject || freshEstimate.title || freshProject.title || "案件"
  );
  const fileName = `領収書_${customer}_${subject}.pdf`;
  const htmlPath = writeHtml(
    freshProject.id,
    "pdf-html",
    `receipt-${freshEstimate.estimateNo}.html`,
    html
  );
  void htmlPath;
  const { pdfBuf } = await renderWithPdfFallback(html, `領収書 ${freshEstimate.estimateNo}`);
  return writePdf(freshProject.id, "pdfs", fileName, pdfBuf);
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
  // 呼び出し元の古いオブジェクトを使わず、常に DB 最新を再取得（請求日=created_at 含む）
  const freshProject = getBusinessProject(project.id) ?? project;
  const freshInvoice = getInvoice(invoice.id) ?? invoice;
  const freshEstimate =
    (freshProject.estimateId ? getEstimate(freshProject.estimateId) : null) ??
    getEstimate(estimate.id) ??
    estimate;
  const html = renderInvoiceHtml(freshProject, freshInvoice, freshEstimate, {
    estimateRefNo:
      ctx?.estimateRefNo ?? freshInvoice.estimateRefNo ?? freshEstimate.estimateNo,
    notes: ctx?.notes,
    priceRuleName: resolveEstimatePriceRule(freshEstimate, freshProject.customerId).ruleName,
    shuseiDiscount: freshEstimate.shuseiDiscount,
    shuseiDiscountMemo: freshEstimate.shuseiDiscountMemo,
    lineSubtotal: freshEstimate.lineSubtotal,
    paymentDueDate: freshInvoice.paymentDueDate ?? freshProject.paymentDueDate,
  });
  const { pdfPath } = await writePdfFromHtml(
    freshProject,
    "invoice",
    freshInvoice,
    html,
    `請求 ${freshInvoice.invoiceNo}`,
    freshInvoice.pdfPath
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
  const freshProject = getBusinessProject(project.id) ?? project;
  const freshEstimate = getEstimate(estimate.id) ?? estimate;
  if (!opts?.regenerate) {
    const stored = resolveStoredPdfPath(freshEstimate.pdfPath);
    if (stored) return { contentType: "application/pdf", path: stored, stored: true };
  }
  const html = renderEstimateHtml(freshProject, freshEstimate, {
    siteName: ctx?.siteName,
    workLocation: ctx?.workLocation ?? freshProject.address,
    staffName: ctx?.staffName,
    notes: ctx?.notes,
    header: ctx?.header ?? freshEstimate.header,
    priceRuleName: resolveEstimatePriceRule(freshEstimate, freshProject.customerId).ruleName,
  });
  const tmp = businessUploadsDir(freshProject.id, "pdf-html");
  // 毎回上書きし、古い HTML キャッシュを残さない
  const p = path.join(tmp, "estimate-live.html");
  fs.writeFileSync(p, html, "utf8");
  return { contentType: "text/html; charset=UTF-8", path: p, stored: false };
}

export function getReceiptPdfOrPlaceholder(
  project: BusinessProject,
  estimate: Estimate,
  ctx?: ReceiptPdfRenderContext,
  opts?: PdfServeOptions & { receiptDate?: string | null; proviso?: string | null }
): { contentType: string; path: string; stored: boolean } {
  const freshProject = getBusinessProject(project.id) ?? project;
  const freshEstimate = getEstimate(estimate.id) ?? estimate;
  const html = renderEstimateHtml(freshProject, freshEstimate, {
    siteName: ctx?.siteName,
    workLocation: ctx?.workLocation ?? freshProject.address,
    staffName: ctx?.staffName,
    notes: ctx?.notes,
    header: ctx?.header ?? freshEstimate.header,
    priceRuleName: resolveEstimatePriceRule(freshEstimate, freshProject.customerId).ruleName,
    mode: "receipt",
    receiptDate: opts?.receiptDate ?? ctx?.receiptDate,
    proviso: opts?.proviso ?? ctx?.proviso,
  });
  const tmp = businessUploadsDir(freshProject.id, "pdf-html");
  const p = path.join(tmp, "receipt-live.html");
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
  const freshProject = getBusinessProject(project.id) ?? project;
  const freshInvoice = getInvoice(invoice.id) ?? invoice;
  const freshEstimate =
    (freshProject.estimateId ? getEstimate(freshProject.estimateId) : null) ??
    getEstimate(estimate.id) ??
    estimate;
  if (!opts?.regenerate) {
    const stored = resolveStoredPdfPath(freshInvoice.pdfPath);
    if (stored) return { contentType: "application/pdf", path: stored, stored: true };
  }
  const html = renderInvoiceHtml(freshProject, freshInvoice, freshEstimate, {
    estimateRefNo:
      ctx?.estimateRefNo ?? freshInvoice.estimateRefNo ?? freshEstimate.estimateNo,
    notes: ctx?.notes,
    priceRuleName: resolveEstimatePriceRule(freshEstimate, freshProject.customerId).ruleName,
    shuseiDiscount: freshEstimate.shuseiDiscount,
    shuseiDiscountMemo: freshEstimate.shuseiDiscountMemo,
    lineSubtotal: freshEstimate.lineSubtotal,
    paymentDueDate: freshInvoice.paymentDueDate ?? freshProject.paymentDueDate,
  });
  const tmp = businessUploadsDir(freshProject.id, "pdf-html");
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

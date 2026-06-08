/** TOMS 標準見積・請求書フォーマット（Excel連携準備含む） */

import { getDatabase } from "../db/database.js";
import type { BusinessProject, Estimate, EstimateLineItem } from "./business-types.js";
import { getTomsCompanyInfo } from "./pdf/company.js";

export interface TomsEstimateHeader {
  addressee: string;
  subject: string;
  issueDate: string;
  estimateNo: string;
  staffName: string;
  siteName: string;
  workLocation: string;
}

export interface TomsInvoiceHeader {
  addressee: string;
  subject: string;
  invoiceDate: string;
  invoiceNo: string;
  staffName: string;
  siteName: string;
  workLocation: string;
  estimateRefNo: string;
  bankInfo: string;
}

export interface TomsEstimateLine {
  lineNo: number;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface TomsEstimateDocumentV1 {
  version: "toms-standard-v1";
  excelTemplate: "TOMS_見積もり書_フォーマット.xlsx";
  company: ReturnType<typeof getTomsCompanyInfo>;
  header: TomsEstimateHeader;
  lines: TomsEstimateLine[];
  subtotal: number;
  tax: number;
  total: number;
  notes: string;
  photosIncluded: boolean;
  generatedAt: string;
}

export interface TomsInvoiceDocumentV1 {
  version: "toms-standard-v1";
  excelTemplate: "TOMS_請求書_フォーマット.xlsx";
  company: ReturnType<typeof getTomsCompanyInfo>;
  header: TomsInvoiceHeader;
  lines: TomsEstimateLine[];
  subtotal: number;
  tax: number;
  total: number;
  generatedAt: string;
}

export const TOMS_DEFAULT_STAFF = "山中 智紀";

export const TOMS_DEFAULT_BANK_INFO =
  process.env.TOMS_BANK_INFO ??
  "みずほ銀行 守谷支店 普通 1234567 カ）トムス";

/** 発行日 YYYY/MM/DD */
export function formatTomsIssueDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/** 見積・請求番号プレフィックス YYMMDD */
export function formatTomsDocDatePrefix(d = new Date()): string {
  const yy = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${yy}${m}${day}`;
}

/** 当日連番 YYMMDD-001 */
export function generateTomsDailyDocNo(
  table: "business_estimates" | "business_invoices",
  column: "estimate_no" | "invoice_no",
  d = new Date()
): string {
  const prefix = formatTomsDocDatePrefix(d);
  const pattern = `${prefix}-%`;
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) as c FROM ${table} WHERE ${column} LIKE ?`)
    .get(pattern) as { c: number };
  return `${prefix}-${String(row.c + 1).padStart(3, "0")}`;
}

export function lineDescription(item: EstimateLineItem): string {
  const name = (item.name || "").trim();
  const memo = (item.memo || "").trim();
  if (name && memo) return `${name}\n${memo}`;
  return name || memo || "";
}

export function isEmptyLineItem(item: EstimateLineItem): boolean {
  const desc = lineDescription(item);
  if (desc) return false;
  const qty = Number(item.quantity ?? 0);
  const price = Number(item.unitPrice ?? 0);
  const amount = Number(item.amount ?? 0);
  return qty === 0 && price === 0 && amount === 0;
}

export function itemsToTomsLines(items: EstimateLineItem[]): TomsEstimateLine[] {
  return items
    .filter((item) => !isEmptyLineItem(item))
    .map((item, i) => ({
      lineNo: i + 1,
      description: lineDescription(item),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
    }));
}

/** 宛名に御中を付与（様・御中が無い場合） */
export function formatTomsAddressee(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "御中";
  if (/御中\s*$|様\s*$/.test(trimmed)) return trimmed;
  return `${trimmed} 御中`;
}

export function buildDefaultEstimateHeader(
  estimate: Estimate,
  ctx: {
    siteName?: string | null;
    workLocation?: string | null;
    staffName?: string | null;
  } = {}
): TomsEstimateHeader {
  return {
    addressee: estimate.customerName,
    subject: estimate.title,
    issueDate: formatTomsIssueDate(new Date(estimate.createdAt)),
    estimateNo: estimate.estimateNo,
    staffName: ctx.staffName ?? TOMS_DEFAULT_STAFF,
    siteName: ctx.siteName ?? estimate.title,
    workLocation: ctx.workLocation ?? "",
  };
}

export function parseEstimateHeaderJson(raw: string | null | undefined): TomsEstimateHeader | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TomsEstimateHeader;
  } catch {
    return null;
  }
}

export function mergeEstimateHeader(
  estimate: Estimate,
  stored: TomsEstimateHeader | null,
  ctx: {
    siteName?: string | null;
    workLocation?: string | null;
    staffName?: string | null;
  } = {}
): TomsEstimateHeader {
  const defaults = buildDefaultEstimateHeader(estimate, ctx);
  if (!stored) return defaults;
  return {
    addressee: stored.addressee || defaults.addressee,
    subject: stored.subject || defaults.subject,
    issueDate: stored.issueDate || defaults.issueDate,
    estimateNo: stored.estimateNo || defaults.estimateNo,
    staffName: stored.staffName || defaults.staffName,
    siteName: stored.siteName || defaults.siteName,
    workLocation: stored.workLocation || defaults.workLocation,
  };
}

export function buildTomsEstimateDocument(
  project: BusinessProject,
  estimate: Estimate,
  header: TomsEstimateHeader,
  opts?: { notes?: string; photosIncluded?: boolean }
): TomsEstimateDocumentV1 {
  return {
    version: "toms-standard-v1",
    excelTemplate: "TOMS_見積もり書_フォーマット.xlsx",
    company: getTomsCompanyInfo(),
    header,
    lines: itemsToTomsLines(estimate.items),
    subtotal: estimate.subtotal,
    tax: estimate.tax,
    total: estimate.total,
    notes: opts?.notes ?? project.surveyMemo ?? "",
    photosIncluded: opts?.photosIncluded ?? true,
    generatedAt: new Date().toISOString(),
  };
}

export function buildTomsInvoiceDocument(
  estimate: Estimate,
  header: TomsInvoiceHeader
): TomsInvoiceDocumentV1 {
  return {
    version: "toms-standard-v1",
    excelTemplate: "TOMS_請求書_フォーマット.xlsx",
    company: getTomsCompanyInfo(),
    header,
    lines: itemsToTomsLines(estimate.items),
    subtotal: estimate.subtotal,
    tax: estimate.tax,
    total: estimate.total,
    generatedAt: new Date().toISOString(),
  };
}

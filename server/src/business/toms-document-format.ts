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
  /** 見積有効期限（YYYY/MM/DD）。未設定時は発行日+30日 */
  validUntil?: string;
  /** @deprecated 後方互換のみ。UI・PDFでは工事場所を使用 */
  siteName?: string;
  workLocation: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface TomsInvoiceHeader {
  addressee: string;
  subject: string;
  invoiceDate: string;
  invoiceNo: string;
  staffName: string;
  /** @deprecated 後方互換のみ */
  siteName?: string;
  workLocation: string;
  address?: string;
  phone?: string;
  email?: string;
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
  lineSubtotal?: number;
  shuseiDiscount?: number;
  shuseiDiscountMemo?: string;
  subtotal: number;
  tax: number;
  total: number;
  priceRule?: {
    ruleName: string;
    costMultiplier: number;
    laborMultiplier: number;
    discountPolicyMemo?: string;
  } | null;
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
  "常陽銀行 越谷支店\n普通 1370414\nトムス";

export const TOMS_ESTIMATE_VALID_DAYS = 30;

/** YYYY/MM/DD または ISO 日付を TOMS 表示形式へ */
export function formatTomsDateDisplay(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) return trimmed;
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}/${iso[2]}/${iso[3]}`;
  return trimmed;
}

function parseTomsDateInput(raw: string): Date | null {
  const trimmed = raw.trim();
  const slash = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (slash) {
    const d = new Date(Number(slash[1]), Number(slash[2]) - 1, Number(slash[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 見積有効期限 — header.validUntil 優先、なければ発行日+30日 */
export function computeTomsEstimateValidUntil(
  issueDate: string,
  validUntil?: string | null
): string {
  const stored = formatTomsDateDisplay(validUntil);
  if (stored) return stored;
  const base = parseTomsDateInput(issueDate);
  if (!base) return "—";
  base.setDate(base.getDate() + TOMS_ESTIMATE_VALID_DAYS);
  return formatTomsIssueDate(base);
}

/** 請求書の支払期限表示 */
export function formatTomsPaymentDueDate(raw: string | null | undefined): string {
  const formatted = formatTomsDateDisplay(raw);
  return formatted || "—";
}

/** 振込先 — 空/破損時は TOMS 既定口座 */
export function resolveTomsBankInfo(bankInfo: string | null | undefined): string {
  const trimmed = (bankInfo ?? "").trim();
  if (!trimmed || /^\?{3,}$/.test(trimmed)) return TOMS_DEFAULT_BANK_INFO;
  return trimmed;
}

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
  if (!trimmed || trimmed === "未設定") return "未設定";
  if (/御中\s*$|様\s*$/.test(trimmed)) return trimmed;
  return `${trimmed} 御中`;
}

export function buildDefaultEstimateHeader(
  estimate: Estimate,
  ctx: {
    siteName?: string | null;
    workLocation?: string | null;
    staffName?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
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
    address: ctx.address ?? "",
    phone: ctx.phone ?? "",
    email: ctx.email ?? "",
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
    address?: string | null;
    phone?: string | null;
    email?: string | null;
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
    validUntil: stored.validUntil || defaults.validUntil,
    siteName: stored.siteName || defaults.siteName,
    workLocation: stored.workLocation || defaults.workLocation,
    address: stored.address || defaults.address,
    phone: stored.phone || defaults.phone,
    email: stored.email || defaults.email,
  };
}

export function buildTomsEstimateDocument(
  project: BusinessProject,
  estimate: Estimate,
  header: TomsEstimateHeader,
  opts?: {
    notes?: string;
    photosIncluded?: boolean;
    priceRule?: {
      ruleName: string;
      costMultiplier: number;
      laborMultiplier: number;
      discountPolicyMemo?: string;
    } | null;
    shuseiDiscount?: number;
    shuseiDiscountMemo?: string;
  }
): TomsEstimateDocumentV1 {
  return {
    version: "toms-standard-v1",
    excelTemplate: "TOMS_見積もり書_フォーマット.xlsx",
    company: getTomsCompanyInfo(),
    header,
    lines: itemsToTomsLines(estimate.items),
    lineSubtotal: estimate.lineSubtotal,
    shuseiDiscount: opts?.shuseiDiscount ?? estimate.shuseiDiscount,
    shuseiDiscountMemo: opts?.shuseiDiscountMemo ?? estimate.shuseiDiscountMemo,
    subtotal: estimate.subtotal,
    tax: estimate.tax,
    total: estimate.total,
    priceRule: opts?.priceRule ?? null,
    notes: opts?.notes ?? project.surveyMemo ?? "",
    photosIncluded: opts?.photosIncluded === true,
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

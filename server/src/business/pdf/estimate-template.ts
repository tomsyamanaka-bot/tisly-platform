import type { BusinessProject, Estimate } from "../business-types.js";
import { buildCustomerFacingPdfNotes, filterCustomerFacingLineDescription } from "../customer-price-rules.js";
import {
  computeTomsEstimateValidUntil,
  itemsToTomsLines,
  mergeEstimateHeader,
  resolveTomsIssueDateDisplay,
  type TomsEstimateHeader,
} from "../toms-document-format.js";
import {
  sanitizePdfItemText,
  sanitizePdfNotesText,
  sanitizePdfRequiredField,
} from "./pdf-text-sanitize.js";
import { escapeHtml, resolvePdfProjectNo } from "./pdf-base-template.js";
import {
  renderTomsV2DocumentBody,
  TOMS_V2_STYLES,
  wrapTomsV2Html,
  type TomsV2PageContext,
} from "./toms-excel-doc-layout-v2.js";

function sanitizeEstimateHeader(header: ReturnType<typeof mergeEstimateHeader>) {
  return {
    ...header,
    addressee: sanitizePdfRequiredField(header.addressee),
    subject: sanitizePdfRequiredField(header.subject),
    workLocation: sanitizePdfRequiredField(header.workLocation),
    staffName: sanitizePdfRequiredField(header.staffName, "山中 智紀"),
    address: sanitizePdfRequiredField(header.address ?? "", ""),
    phone: sanitizePdfRequiredField(header.phone ?? "", ""),
    email: sanitizePdfRequiredField(header.email ?? "", ""),
  };
}

/** 見積 / 領収書モード（既存見積を流用） */
export type EstimateDocumentMode = "estimate" | "receipt";

export const DEFAULT_RECEIPT_PROVISO =
  "但 TVアンテナ・防犯カメラ工事代金として";

export interface EstimateHtmlOptions {
  siteName?: string | null;
  workLocation?: string | null;
  staffName?: string | null;
  notes?: string | null;
  header?: TomsEstimateHeader | null;
  priceRuleName?: string | null;
  /** 見積（既定）または領収書 */
  mode?: EstimateDocumentMode;
  /** 領収日（未指定時は発行日） */
  receiptDate?: string | null;
  /** 但し書き */
  proviso?: string | null;
}

function buildEstimateContext(
  project: BusinessProject,
  estimate: Estimate,
  opts?: EstimateHtmlOptions
): TomsV2PageContext {
  const header = sanitizeEstimateHeader(
    mergeEstimateHeader(estimate, opts?.header ?? estimate.header ?? null, {
      siteName: opts?.siteName,
      workLocation: sanitizePdfRequiredField(opts?.workLocation ?? project.address),
      staffName: opts?.staffName,
    })
  );
  const lines = itemsToTomsLines(estimate.items).map((line) => ({
    ...line,
    description: sanitizePdfItemText(filterCustomerFacingLineDescription(line.description)),
  }));
  const notes = sanitizePdfNotesText(
    buildCustomerFacingPdfNotes(opts?.notes ?? project.surveyMemo ?? "")
  );
  const mode: EstimateDocumentMode =
    opts?.mode === "receipt" ? "receipt" : "estimate";
  const isReceipt = mode === "receipt";

  const validUntil = computeTomsEstimateValidUntil(header.issueDate, header.validUntil);
  // 見積: 有効期限 / 領収書: 印紙不要注記
  const footerExtras = isReceipt
    ? `<div class="toms-v2-stamp-note">※電子発行につき印紙不要</div>`
    : validUntil && validUntil !== "—"
      ? `<div class="toms-v2-footer-extras">有効期限：${escapeHtml(validUntil)}</div>`
      : "";

  const receiptDateRaw = String(opts?.receiptDate ?? "").trim();
  const issueDate = isReceipt
    ? resolveTomsIssueDateDisplay(receiptDateRaw || header.issueDate)
    : resolveTomsIssueDateDisplay(header.issueDate);

  const provisoRaw = String(opts?.proviso ?? "").trim();
  const provisoText = isReceipt
    ? provisoRaw || DEFAULT_RECEIPT_PROVISO
    : undefined;

  return {
    kind: isReceipt ? "receipt" : "estimate",
    docTitle: isReceipt ? "領収書" : "お見積書",
    introText: isReceipt
      ? "上記の通り、正に領収いたしました。"
      : "下記の通り、お見積り申し上げます。",
    addressee: header.addressee,
    subject: header.subject,
    workLocation: header.workLocation,
    projectNo: resolvePdfProjectNo(project.projectNo, header.estimateNo),
    issueDateLabel: isReceipt ? "領収日" : "発行日",
    issueDate,
    docNoLabel: isReceipt ? "領収番号" : "見積番号",
    docNo: header.estimateNo,
    // 領収書はインボイス登録番号を表示
    includeRegistrationNo: isReceipt,
    staffName: header.staffName,
    total: estimate.total,
    lines,
    totals: {
      lineSubtotal: estimate.lineSubtotal ?? estimate.subtotal + estimate.shuseiDiscount,
      shuseiDiscount: estimate.shuseiDiscount,
      shuseiDiscountMemo: estimate.shuseiDiscountMemo,
      subtotal: estimate.subtotal,
      tax: estimate.tax,
      total: estimate.total,
    },
    notes,
    footerExtras,
    provisoText,
  };
}

export function renderEstimateHtml(
  project: BusinessProject,
  estimate: Estimate,
  opts?: EstimateHtmlOptions
): string {
  const ctx = buildEstimateContext(project, estimate, opts);
  const titlePrefix = ctx.kind === "receipt" ? "領収書" : "お見積書";
  return wrapTomsV2Html(`${titlePrefix} ${ctx.docNo}`, renderTomsV2DocumentBody(ctx));
}

/** @deprecated use renderEstimateHtml — v2 統合後の互換エイリアス */
export const renderEstimateHtmlV2 = renderEstimateHtml;

export { TOMS_V2_STYLES as ESTIMATE_TEMPLATE_STYLES };

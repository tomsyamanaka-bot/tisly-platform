import type { BusinessProject, Estimate } from "../business-types.js";
import { buildCustomerFacingPdfNotes, filterCustomerFacingLineDescription } from "../customer-price-rules.js";
import {
  computeTomsEstimateValidUntil,
  itemsToTomsLines,
  mergeEstimateHeader,
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

export interface EstimateHtmlOptions {
  siteName?: string | null;
  workLocation?: string | null;
  staffName?: string | null;
  notes?: string | null;
  header?: TomsEstimateHeader | null;
  priceRuleName?: string | null;
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
  const validUntil = computeTomsEstimateValidUntil(header.issueDate, header.validUntil);
  const footerExtras = validUntil && validUntil !== "—"
    ? `<div class="toms-v2-footer-extras">有効期限：${escapeHtml(validUntil)}</div>`
    : "";

  return {
    kind: "estimate",
    docTitle: "お見積書",
    introText: "下記の通り、お見積り申し上げます。",
    addressee: header.addressee,
    subject: header.subject,
    workLocation: header.workLocation,
    projectNo: resolvePdfProjectNo(project.projectNo, header.estimateNo),
    issueDateLabel: "発行日",
    issueDate: header.issueDate,
    docNoLabel: "見積番号",
    docNo: header.estimateNo,
    includeRegistrationNo: false,
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
  };
}

export function renderEstimateHtml(
  project: BusinessProject,
  estimate: Estimate,
  opts?: EstimateHtmlOptions
): string {
  const ctx = buildEstimateContext(project, estimate, opts);
  return wrapTomsV2Html(`お見積書 ${ctx.docNo}`, renderTomsV2DocumentBody(ctx));
}

/** @deprecated use renderEstimateHtml — v2 統合後の互換エイリアス */
export const renderEstimateHtmlV2 = renderEstimateHtml;

export { TOMS_V2_STYLES as ESTIMATE_TEMPLATE_STYLES };

import type { BusinessProject, Estimate } from "../business-types.js";
import { buildCustomerFacingPdfNotes, filterCustomerFacingLineDescription } from "../customer-price-rules.js";
import {
  itemsToTomsLines,
  mergeEstimateHeader,
  type TomsEstimateHeader,
} from "../toms-document-format.js";
import {
  TOMS_PDF_CHARSET_META,
  TOMS_PDF_FONT_LINKS,
  TOMS_PDF_STYLES,
  TOMS_PDF_VIEWPORT_META,
} from "./styles.js";
import {
  sanitizePdfDisplayText,
  sanitizePdfItemText,
  sanitizePdfNotesText,
} from "./pdf-text-sanitize.js";
import {
  escapeHtml,
  renderNotes,
  renderPhotoGrid,
  renderTomsOfficialDocLayout,
  renderTomsLineItemsTable,
  renderTotals,
} from "./shared-blocks.js";

function sanitizeEstimateHeader(header: ReturnType<typeof mergeEstimateHeader>) {
  return {
    ...header,
    addressee: sanitizePdfDisplayText(header.addressee),
    subject: sanitizePdfDisplayText(header.subject),
    workLocation: sanitizePdfDisplayText(header.workLocation, ""),
    staffName: sanitizePdfDisplayText(header.staffName, ""),
    address: sanitizePdfDisplayText(header.address ?? "", ""),
    phone: sanitizePdfDisplayText(header.phone ?? "", ""),
    email: sanitizePdfDisplayText(header.email ?? "", ""),
  };
}

export interface EstimateHtmlOptions {
  siteName?: string | null;
  workLocation?: string | null;
  staffName?: string | null;
  notes?: string | null;
  header?: TomsEstimateHeader | null;
  includePhotos?: boolean;
  priceRuleName?: string | null;
}

export function renderEstimateHtml(
  project: BusinessProject,
  estimate: Estimate,
  opts?: EstimateHtmlOptions
): string {
  const header = sanitizeEstimateHeader(
    mergeEstimateHeader(estimate, opts?.header ?? estimate.header ?? null, {
      siteName: opts?.siteName,
      workLocation: sanitizePdfDisplayText(opts?.workLocation ?? project.address, ""),
      staffName: opts?.staffName,
    })
  );
  const lines = itemsToTomsLines(estimate.items)
    .map((line) => ({
      ...line,
      description: sanitizePdfItemText(filterCustomerFacingLineDescription(line.description)),
    }))
    .filter((line) => line.description.trim());
  const notes = sanitizePdfNotesText(
    buildCustomerFacingPdfNotes(opts?.notes ?? project.surveyMemo ?? "")
  );
  const includePhotos = opts?.includePhotos === true;
  const photoBlock =
    includePhotos && project.surveyPhotos?.length
      ? renderPhotoGrid(project.surveyPhotos, true)
      : "";
  const pageClass = includePhotos ? "doc with-photos" : "doc single-page";

  return `<!DOCTYPE html><html lang="ja"><head>${TOMS_PDF_CHARSET_META}${TOMS_PDF_FONT_LINKS}${TOMS_PDF_VIEWPORT_META}<title>お見積書 ${escapeHtml(header.estimateNo)}</title><style>${TOMS_PDF_STYLES}</style></head><body>
<div class="${pageClass}">
${renderTomsOfficialDocLayout({
  docTitle: "お見積書",
  amountLabel: "御見積金額",
  addressee: header.addressee,
  subject: header.subject,
  workLocation: header.workLocation || opts?.workLocation || project.address,
  issueDateLabel: "発行日",
  issueDate: header.issueDate,
  docNoLabel: "見積番号",
  docNo: header.estimateNo,
  total: estimate.total,
})}
${renderTomsLineItemsTable(lines)}
${renderTotals({
  lineSubtotal: estimate.lineSubtotal ?? estimate.subtotal + estimate.shuseiDiscount,
  shuseiDiscount: estimate.shuseiDiscount,
  shuseiDiscountMemo: estimate.shuseiDiscountMemo,
  subtotal: estimate.subtotal,
  tax: estimate.tax,
  total: estimate.total,
})}
${renderNotes(notes)}
${photoBlock}
</div></body></html>`;
}

import type { BusinessProject, Estimate } from "../business-types.js";
import {
  itemsToTomsLines,
  mergeEstimateHeader,
  type TomsEstimateHeader,
} from "../toms-document-format.js";
import { TOMS_PDF_STYLES } from "./styles.js";
import {
  escapeHtml,
  renderAmountBanner,
  renderNotes,
  renderPhotoGrid,
  renderPriceRuleLine,
  renderTomsDocLayoutHeader,
  renderTomsLineItemsTable,
  renderTotals,
} from "./shared-blocks.js";

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
  const header = mergeEstimateHeader(estimate, opts?.header ?? estimate.header ?? null, {
    siteName: opts?.siteName,
    workLocation: opts?.workLocation ?? project.address,
    staffName: opts?.staffName,
  });
  const lines = itemsToTomsLines(estimate.items);
  const notes = opts?.notes ?? project.surveyMemo ?? "";
  const includePhotos = opts?.includePhotos === true;
  const photoBlock =
    includePhotos && project.surveyPhotos?.length
      ? renderPhotoGrid(project.surveyPhotos, true)
      : "";
  const pageClass = includePhotos ? "doc with-photos" : "doc single-page";

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/><title>お見積書 ${escapeHtml(header.estimateNo)}</title><style>${TOMS_PDF_STYLES}</style></head><body>
<div class="${pageClass}">
${renderTomsDocLayoutHeader({
  docTitle: "お見積書",
  addressee: header.addressee,
  subject: header.subject,
  issueDateLabel: "発行日",
  issueDate: header.issueDate,
  docNoLabel: "見積番号",
  docNo: header.estimateNo,
  includeRegistrationNo: false,
})}
${renderAmountBanner(estimate.total)}
${renderPriceRuleLine(opts?.priceRuleName ?? estimate.priceRuleName)}
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

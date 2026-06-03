import type { BusinessProject, Estimate } from "../business-types.js";
import { TOMS_PDF_STYLES } from "./styles.js";
import {
  escapeHtml,
  renderCustomerBlock,
  renderLineItemsTable,
  renderNotes,
  renderPdfHeader,
  renderPhotoGrid,
  renderSealPlaceholder,
  renderTotals,
} from "./shared-blocks.js";

export function renderEstimateHtml(project: BusinessProject, estimate: Estimate): string {
  const items = estimate.items.map((i) => ({
    ...i,
    taxType: "課税10%",
  }));
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/><title>見積 ${escapeHtml(estimate.estimateNo)}</title><style>${TOMS_PDF_STYLES}</style></head><body>
<div class="doc">
${renderPdfHeader("御見積書", estimate.estimateNo)}
${renderCustomerBlock(project.customerName, project.title, project.address, project.projectNo)}
${renderLineItemsTable(items)}
${renderTotals(estimate.subtotal, estimate.tax, estimate.total)}
${renderNotes(project.surveyMemo ?? "")}
${renderPhotoGrid(project.surveyPhotos || [])}
<div class="doc-footer">${renderSealPlaceholder()}</div>
</div></body></html>`;
}

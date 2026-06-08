import type { BusinessProject, Estimate } from "../business-types.js";
import { TOMS_PDF_STYLES } from "./styles.js";
import {
  escapeHtml,
  renderLineItemsTable,
  renderNotes,
  renderPdfHeader,
  renderPhotoGrid,
  renderSealPlaceholder,
  renderTomsCustomerSiteBlock,
  renderTotals,
} from "./shared-blocks.js";

export function renderEstimateHtml(
  project: BusinessProject,
  estimate: Estimate,
  opts?: {
    siteName?: string | null;
    customerAddress?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
  }
): string {
  const items = estimate.items.map((i) => ({
    ...i,
    taxType: "課税10%",
  }));
  const estimateDate = estimate.updatedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const notes = opts?.notes ?? project.surveyMemo ?? "";
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/><title>御見積書 ${escapeHtml(estimate.estimateNo)}</title><style>${TOMS_PDF_STYLES}</style></head><body>
<div class="doc">
${renderPdfHeader("御見積書", estimate.estimateNo)}
${renderTomsCustomerSiteBlock({
  customerName: estimate.customerName || project.customerName,
  customerAddress: opts?.customerAddress,
  siteName: opts?.siteName ?? project.title,
  siteAddress: project.address,
  contactName: opts?.contactName,
  phone: opts?.phone ?? project.phone,
  email: opts?.email,
  projectNo: project.projectNo,
  estimateDate,
})}
<p class="intro">下記の通りお見積り申し上げます。</p>
${renderLineItemsTable(items)}
${renderTotals(estimate.subtotal, estimate.tax, estimate.total)}
${renderNotes(notes)}
${renderPhotoGrid(project.surveyPhotos || [])}
<div class="doc-footer">${renderSealPlaceholder()}</div>
</div></body></html>`;
}

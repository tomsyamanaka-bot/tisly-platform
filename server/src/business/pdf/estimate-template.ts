import type { BusinessProject, Estimate } from "../business-types.js";
import { buildCustomerFacingPdfNotes, filterCustomerFacingLineDescription } from "../customer-price-rules.js";
import {
  computeTomsEstimateValidUntil,
  itemsToTomsLines,
  mergeEstimateHeader,
  type TomsEstimateHeader,
} from "../toms-document-format.js";
import {
  TOMS_PDF_CHARSET_META,
  TOMS_PDF_FONT_LINKS,
  TOMS_PDF_STYLES,
  TOMS_PDF_VIEWPORT_META,
  TOMS_DOC_PHOTO_EXTRA_STYLES,
} from "./styles.js";
import {
  sanitizePdfItemText,
  sanitizePdfNotesText,
  sanitizePdfRequiredField,
} from "./pdf-text-sanitize.js";
import { renderTomsDocWithPhotoLayout } from "./toms-doc-photo-layout.js";
import {
  escapeHtml,
  renderNotes,
  renderTomsDocFooter,
  renderTomsOfficialDocLayout,
  renderTomsLineItemsTable,
  renderTotals,
} from "./shared-blocks.js";

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
  const includePhotos = opts?.includePhotos === true && (project.surveyPhotos?.length ?? 0) > 0;

  const coverHeaderHtml = renderTomsOfficialDocLayout({
    docTitle: "お見積書",
    amountLabel: "御見積金額",
    addressee: header.addressee,
    subject: header.subject,
    workLocation: header.workLocation,
    issueDateLabel: "発行日",
    issueDate: header.issueDate,
    docNoLabel: "見積番号",
    docNo: header.estimateNo,
    total: estimate.total,
    includeRegistrationNo: false,
  });

  const documentBodyHtml = `${renderTomsLineItemsTable(lines)}
${renderTotals({
  lineSubtotal: estimate.lineSubtotal ?? estimate.subtotal + estimate.shuseiDiscount,
  shuseiDiscount: estimate.shuseiDiscount,
  shuseiDiscountMemo: estimate.shuseiDiscountMemo,
  subtotal: estimate.subtotal,
  tax: estimate.tax,
  total: estimate.total,
})}
${renderNotes(notes)}
${renderTomsDocFooter({ staffName: header.staffName, validUntil })}`;

  if (includePhotos) {
    const { photoPageStyles, bodyHtml } = renderTomsDocWithPhotoLayout({
      prefix: "est",
      photos: project.surveyPhotos ?? [],
      projectNo: project.projectNo,
      generatedAt: estimate.updatedAt ?? estimate.createdAt,
      coverHeaderHtml,
      documentBodyHtml,
    });
    return `<!DOCTYPE html><html lang="ja"><head>${TOMS_PDF_CHARSET_META}${TOMS_PDF_FONT_LINKS}${TOMS_PDF_VIEWPORT_META}<title>お見積書 ${escapeHtml(header.estimateNo)}</title><style>${TOMS_PDF_STYLES}${photoPageStyles}${TOMS_DOC_PHOTO_EXTRA_STYLES}</style></head><body>
${bodyHtml}
</body></html>`;
  }

  return `<!DOCTYPE html><html lang="ja"><head>${TOMS_PDF_CHARSET_META}${TOMS_PDF_FONT_LINKS}${TOMS_PDF_VIEWPORT_META}<title>お見積書 ${escapeHtml(header.estimateNo)}</title><style>${TOMS_PDF_STYLES}</style></head><body>
<div class="doc single-page">
${coverHeaderHtml}
${documentBodyHtml}
</div></body></html>`;
}

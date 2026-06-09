import { itemsToTomsLines, mergeEstimateHeader, } from "../toms-document-format.js";
import { TOMS_PDF_STYLES } from "./styles.js";
import { escapeHtml, renderAmountBanner, renderNotes, renderPhotoGrid, renderTomsCompanyFooter, renderTomsEstimateStandardHeader, renderTomsLineItemsTable, renderTotals, } from "./shared-blocks.js";
export function renderEstimateHtml(project, estimate, opts) {
    const header = mergeEstimateHeader(estimate, opts?.header ?? estimate.header ?? null, {
        siteName: opts?.siteName,
        workLocation: opts?.workLocation ?? project.address,
        staffName: opts?.staffName,
    });
    const lines = itemsToTomsLines(estimate.items);
    const notes = opts?.notes ?? project.surveyMemo ?? "";
    const includePhotos = opts?.includePhotos === true;
    const photoBlock = includePhotos && project.surveyPhotos?.length
        ? renderPhotoGrid(project.surveyPhotos, true)
        : "";
    const pageClass = includePhotos ? "doc with-photos" : "doc single-page";
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/><title>お見積書 ${escapeHtml(header.estimateNo)}</title><style>${TOMS_PDF_STYLES}</style></head><body>
<div class="${pageClass}">
${renderTomsEstimateStandardHeader(header)}
${renderAmountBanner(estimate.total)}
${renderTomsLineItemsTable(lines)}
${renderTotals(estimate.subtotal, estimate.tax, estimate.total)}
${renderNotes(notes)}
${photoBlock}
${renderTomsCompanyFooter()}
</div></body></html>`;
}

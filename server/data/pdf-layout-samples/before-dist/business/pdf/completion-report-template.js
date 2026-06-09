import { TOMS_PDF_STYLES } from "./styles.js";
import { renderCustomerBlock, renderNotes, renderPdfHeader, renderSealPlaceholder, escapeHtml, } from "./shared-blocks.js";
export function renderCompletionReportHtml(project, report) {
    const before = report.beforePhotos
        .map((p) => `<div class="photo-slot">施工前: ${escapeHtml(p.fileName ?? p.id)}</div>`)
        .join("");
    const after = report.afterPhotos
        .map((p) => `<div class="photo-slot">施工後: ${escapeHtml(p.fileName ?? p.id)}</div>`)
        .join("");
    const construction = (project.constructionPhotos || [])
        .slice(0, 3)
        .map((p) => `<div class="photo-slot">${escapeHtml(p.fileName)}</div>`)
        .join("");
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/><title>完了報告 ${escapeHtml(report.title)}</title><style>${TOMS_PDF_STYLES}</style></head><body>
<div class="doc">
${renderPdfHeader("工事完了報告書", report.title)}
${renderCustomerBlock(project.customerName, project.title, project.address, project.projectNo)}
${renderNotes(report.workMemo || report.title)}
<h3>写真欄</h3>
<div class="photos">${before}${after}${construction || '<div class="photo-slot">写真なし</div>'}</div>
<div class="doc-footer">${renderSealPlaceholder()}</div>
</div></body></html>`;
}

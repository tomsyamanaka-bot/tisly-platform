import type { BusinessProject, CompletionReport } from "../business-types.js";
import { getTomsCompanyInfo } from "./company.js";
import { TOMS_PDF_STYLES } from "./styles.js";

export function renderCompletionReportHtml(
  project: BusinessProject,
  report: CompletionReport
): string {
  const co = getTomsCompanyInfo();
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
<header>
  <div><img class="logo" src="${escapeHtml(co.logoUrl)}" alt="TOMS"/><h1>工事完了報告書</h1></div>
  <div class="company">${escapeHtml(co.name)}<br/>${escapeHtml(co.email)}</div>
</header>
<p><strong>宛名</strong> ${escapeHtml(project.customerName)} 様</p>
<p><strong>件名</strong> ${escapeHtml(project.title)}</p>
<p class="meta">案件番号 ${escapeHtml(project.projectNo)}</p>
<div class="notes"><strong>作業内容</strong><br/>${escapeHtml(report.workMemo || "—")}</div>
<h3>写真欄</h3>
<div class="photos">${before}${after}${construction || '<div class="photo-slot">写真なし</div>'}</div>
</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

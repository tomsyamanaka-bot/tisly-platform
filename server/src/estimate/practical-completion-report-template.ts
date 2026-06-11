import { renderPracticalPdfHtml, type PracticalPdfPhoto } from "./practical-pdf-layout.js";

export type PracticalCompletionReportPhoto = PracticalPdfPhoto;

export interface PracticalCompletionReportContext {
  projectNo: string;
  addressee: string;
  subject: string;
  siteName: string;
  workLocation: string;
  issueDate: string;
  staffName: string;
  startTime?: string;
  endTime?: string;
  workContent?: string;
  checklistSummary?: string;
  notes?: string;
  photos: PracticalCompletionReportPhoto[];
}

function renderWorkSummaryBlock(ctx: PracticalCompletionReportContext): string {
  const rows: string[] = [];
  if (ctx.staffName) rows.push(`<tr><th>作業員</th><td>${escapeHtml(ctx.staffName)}</td></tr>`);
  if (ctx.startTime) rows.push(`<tr><th>開始時間</th><td>${escapeHtml(ctx.startTime)}</td></tr>`);
  if (ctx.endTime) rows.push(`<tr><th>終了時間</th><td>${escapeHtml(ctx.endTime)}</td></tr>`);
  if (ctx.workContent) rows.push(`<tr><th>作業内容</th><td>${escapeHtml(ctx.workContent)}</td></tr>`);
  if (ctx.checklistSummary) {
    rows.push(
      `<tr><th>チェック結果</th><td class="cr-checklist-cell">${escapeHtml(ctx.checklistSummary).replace(/\n/g, "<br/>")}</td></tr>`
    );
  }
  if (!rows.length) return "";
  return `<table class="cr-work-summary">${rows.join("")}</table>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderPracticalCompletionReportHtml(ctx: PracticalCompletionReportContext): string {
  return renderPracticalPdfHtml({
    prefix: "cr",
    pageTitle: `完了報告書 ${ctx.projectNo}`,
    header: {
      docTitle: "完了報告書",
      addressee: ctx.addressee,
      subject: ctx.subject,
      workLocation: ctx.workLocation || ctx.siteName,
      issueDateLabel: "作成日",
      issueDate: ctx.issueDate,
      docNoLabel: "案件番号",
      docNo: ctx.projectNo,
      notes: ctx.notes,
    },
    extraBodyHtml: renderWorkSummaryBlock(ctx),
    photos: ctx.photos,
    noPhotosMessage: "完了報告書用写真がありません",
  });
}

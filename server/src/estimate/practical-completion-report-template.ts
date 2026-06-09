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
  notes?: string;
  photos: PracticalCompletionReportPhoto[];
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
    photos: ctx.photos,
    noPhotosMessage: "完了報告書用写真がありません",
  });
}

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
    docTitle: "完了報告書",
    pageTitle: `完了報告書 ${ctx.projectNo}`,
    infoFields: [
      { label: "宛名", value: ctx.addressee },
      { label: "件名", value: ctx.subject },
      { label: "現場名", value: ctx.siteName },
      { label: "住所", value: ctx.workLocation },
      { label: "作成日", value: ctx.issueDate },
      { label: "担当者", value: ctx.staffName },
      ...(ctx.notes?.trim() ? [{ label: "現調メモ", value: ctx.notes.trim() }] : []),
    ],
    photos: ctx.photos,
  });
}

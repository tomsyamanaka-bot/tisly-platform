import { renderPracticalPdfHtml, type PracticalPdfPhoto } from "./practical-pdf-layout.js";

export type SpecificationPhoto = PracticalPdfPhoto;

export interface SpecificationContext {
  addressee: string;
  subject: string;
  siteName: string;
  workLocation: string;
  issueDate: string;
  estimateNo?: string;
  staffName: string;
  notes?: string;
  photos: SpecificationPhoto[];
}

export function renderSpecificationHtml(ctx: SpecificationContext): string {
  return renderPracticalPdfHtml({
    prefix: "sp",
    pageTitle: `仕様書 ${ctx.subject}`,
    header: {
      docTitle: "仕様書",
      addressee: ctx.addressee,
      subject: ctx.subject,
      workLocation: ctx.workLocation || ctx.siteName,
      issueDateLabel: "作成日",
      issueDate: ctx.issueDate,
      docNoLabel: ctx.estimateNo ? "見積番号" : undefined,
      docNo: ctx.estimateNo,
      notes: ctx.notes,
    },
    photos: ctx.photos,
  });
}

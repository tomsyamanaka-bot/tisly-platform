import { renderPracticalPdfHtml, type PracticalPdfPhoto } from "./practical-pdf-layout.js";

export type SpecificationPhoto = PracticalPdfPhoto;

export interface SpecificationContext {
  addressee: string;
  subject: string;
  siteName: string;
  workLocation: string;
  issueDate: string;
  staffName: string;
  notes?: string;
  photos: SpecificationPhoto[];
}

export function renderSpecificationHtml(ctx: SpecificationContext): string {
  return renderPracticalPdfHtml({
    prefix: "sp",
    docTitle: "仕様書",
    pageTitle: `仕様書 ${ctx.subject}`,
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

import { renderPracticalPdfHtml, type PracticalPdfPhoto } from "./practical-pdf-layout.js";

export type SpecificationPhoto = PracticalPdfPhoto;

export interface SpecificationContext {
  projectNo: string;
  addressee: string;
  subject: string;
  siteName: string;
  workLocation: string;
  issueDate: string;
  staffName: string;
  generatedAt: string;
  /** @deprecated お客様向けPDFには出さない */
  systemConfig?: string;
  equipmentList?: string;
  wiringSummary?: string;
  ipList?: string;
  installationLocations?: string;
  notes?: string;
  photos: SpecificationPhoto[];
}

export function renderSpecificationHtml(ctx: SpecificationContext): string {
  const coverFields = [
    { label: "案件名", value: ctx.subject || ctx.siteName },
    { label: "顧客名", value: ctx.addressee },
    { label: "住所", value: ctx.workLocation || ctx.siteName },
    { label: "担当者", value: ctx.staffName },
    { label: "作成日", value: ctx.issueDate },
  ];
  return renderPracticalPdfHtml({
    prefix: "sp",
    pageTitle: `仕様書 ${ctx.subject}`,
    documentTitle: "システム仕様書",
    projectNo: ctx.projectNo,
    generatedAt: ctx.generatedAt,
    coverFields,
    photos: ctx.photos,
    noPhotosMessage: "写真未登録",
  });
}

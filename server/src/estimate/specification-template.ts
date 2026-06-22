import { renderPracticalPdfHtml, type PracticalPdfPhoto } from "./practical-pdf-layout.js";
import {
  buildSpecificationEquipmentBody,
  buildSpecificationWorkContent,
  sanitizeSpecificationNotes,
} from "./specification-pdf-content.js";

export type SpecificationPhoto = PracticalPdfPhoto;

export interface SpecificationDrawingImage {
  url: string;
  title: string;
}

export interface SpecificationContext {
  projectNo: string;
  addressee: string;
  subject: string;
  siteName: string;
  workLocation: string;
  issueDate: string;
  staffName: string;
  generatedAt: string;
  /** 工事内容（工事種別サマリ） */
  systemConfig?: string;
  equipmentList?: string;
  wiringSummary?: string;
  ipList?: string;
  installationLocations?: string;
  notes?: string;
  photos: SpecificationPhoto[];
  drawings?: SpecificationDrawingImage[];
}

export function renderSpecificationHtml(ctx: SpecificationContext): string {
  const coverFields = [
    { label: "現場名", value: ctx.siteName || ctx.subject },
    { label: "件名", value: ctx.subject || ctx.siteName },
    { label: "顧客名", value: ctx.addressee },
    { label: "住所", value: ctx.workLocation || ctx.siteName },
    { label: "担当者", value: ctx.staffName },
    { label: "作成日", value: ctx.issueDate },
  ];
  const coverSections = [
    { title: "工事内容", body: buildSpecificationWorkContent(ctx) },
    { title: "設備一覧", body: buildSpecificationEquipmentBody(ctx) },
  ];
  const memo = sanitizeSpecificationNotes(ctx.notes);
  if (memo) coverSections.push({ title: "メモ", body: memo });

  return renderPracticalPdfHtml({
    prefix: "sp",
    pageTitle: `仕様書 ${ctx.subject}`,
    documentTitle: "仕様書",
    projectNo: ctx.projectNo,
    generatedAt: ctx.generatedAt,
    coverFields,
    coverSections,
    photos: ctx.photos,
    drawings: ctx.drawings ?? [],
    noPhotosMessage: "写真未登録",
  });
}

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
  /** システム構成 */
  systemConfig?: string;
  /** 機器一覧 */
  equipmentList?: string;
  /** 配線概要 */
  wiringSummary?: string;
  /** IP一覧 */
  ipList?: string;
  /** 設置場所一覧 */
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
  const coverSections = [
    { title: "システム構成", body: ctx.systemConfig ?? "—" },
    { title: "機器一覧", body: ctx.equipmentList ?? "—" },
    { title: "配線概要", body: ctx.wiringSummary ?? "—" },
    { title: "IP一覧", body: ctx.ipList ?? "—" },
    { title: "設置場所一覧", body: ctx.installationLocations ?? "—" },
  ];
  if (ctx.notes?.trim()) {
    coverSections.push({ title: "備考", body: ctx.notes.trim() });
  }
  return renderPracticalPdfHtml({
    prefix: "sp",
    pageTitle: `仕様書 ${ctx.subject}`,
    documentTitle: "システム仕様書",
    projectNo: ctx.projectNo,
    generatedAt: ctx.generatedAt,
    coverFields,
    coverSections,
    photos: ctx.photos,
    noPhotosMessage: "写真未登録",
  });
}

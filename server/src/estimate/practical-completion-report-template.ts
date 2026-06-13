import { renderPracticalPdfHtml, type PracticalPdfPhoto } from "./practical-pdf-layout.js";

export type PracticalCompletionReportPhoto = PracticalPdfPhoto;

export interface PracticalCompletionReportContext {
  projectNo: string;
  addressee: string;
  subject: string;
  siteName: string;
  workLocation: string;
  issueDate: string;
  workDate?: string;
  staffName: string;
  startTime?: string;
  endTime?: string;
  workContent?: string;
  materialsUsed?: string;
  checklistSummary?: string;
  notes?: string;
  generatedAt: string;
  photos: PracticalCompletionReportPhoto[];
}

export function renderPracticalCompletionReportHtml(ctx: PracticalCompletionReportContext): string {
  const coverFields = [
    { label: "案件名", value: ctx.subject || ctx.siteName },
    { label: "顧客名", value: ctx.addressee },
    { label: "住所", value: ctx.workLocation || ctx.siteName },
    { label: "担当者", value: ctx.staffName },
    { label: "工事日", value: ctx.workDate ?? ctx.issueDate },
    { label: "開始時間", value: ctx.startTime ?? "—" },
    { label: "終了時間", value: ctx.endTime ?? "—" },
  ];
  const coverSections = [
    { title: "作業内容", body: ctx.workContent ?? "—" },
    { title: "使用部材", body: ctx.materialsUsed ?? "—" },
  ];
  if (ctx.checklistSummary?.trim()) {
    coverSections.push({ title: "確認結果", body: ctx.checklistSummary.trim() });
  }
  if (ctx.notes?.trim()) {
    coverSections.push({ title: "備考", body: ctx.notes.trim() });
  }
  return renderPracticalPdfHtml({
    prefix: "cr",
    pageTitle: `完了報告書 ${ctx.projectNo}`,
    documentTitle: "工事完了報告書",
    projectNo: ctx.projectNo,
    generatedAt: ctx.generatedAt,
    coverFields,
    coverSections,
    photos: ctx.photos,
    noPhotosMessage: "完了報告書用写真がありません",
  });
}

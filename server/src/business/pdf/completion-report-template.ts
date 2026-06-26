/**
 * 完了報告書 PDF テンプレート — 実務 PWA（practical-completion-report-template）へ委譲
 */
import type { BusinessProject, CompletionReport } from "../business-types.js";
import { buildCompletionReportContextV1 } from "../../estimate/estimate-v1-store.js";
import { renderPracticalCompletionReportHtml } from "../../estimate/practical-completion-report-template.js";
import { resolvePdfProjectNo } from "./pdf-base-template.js";

export function renderCompletionReportHtml(
  project: BusinessProject,
  report: CompletionReport
): string {
  const ctx = buildCompletionReportContextV1(project.id);
  if (ctx) return renderPracticalCompletionReportHtml(ctx);

  return renderPracticalCompletionReportHtml({
    projectNo: resolvePdfProjectNo(project.projectNo),
    addressee: project.customerName,
    subject: report.title || project.title,
    siteName: project.title,
    workLocation: project.address,
    issueDate: new Date().toISOString().slice(0, 10),
    staffName: "",
    notes: report.workMemo || report.title || "",
    generatedAt: new Date().toISOString(),
    photos: [],
  });
}

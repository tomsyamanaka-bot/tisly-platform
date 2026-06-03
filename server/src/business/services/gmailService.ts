import { v4 as uuid } from "uuid";
import type { BusinessProject, CompletionReport, Estimate, Invoice, MailDraft } from "../business-types.js";
import { DEFAULT_MAIL_TO as MAIL_TO } from "../business-types.js";
import { generateQnapFilePath } from "./qnapService.js";

export function createEstimateMailDraft(project: BusinessProject, estimate: Estimate): MailDraft {
  const attachEstimate = estimate.pdfPath ?? generateQnapFilePath(project, "estimate", estimate.estimateNo);
  return {
    id: uuid(),
    projectId: project.id,
    type: "estimate_to_owner",
    to: MAIL_TO,
    subject: `【見積確認】${project.customerName}様 — ${project.title}（${estimate.estimateNo}）`,
    body: [
      "山中方様",
      "",
      "お疲れ様です。以下の見積書をご確認ください。",
      "",
      `案件: ${project.title}`,
      `お客様: ${project.customerName}`,
      `住所: ${project.address}`,
      `見積番号: ${estimate.estimateNo}`,
      `税込合計: ¥${estimate.total.toLocaleString("ja-JP")}`,
      "",
      "※ Phase521–540: 実送信は未接続（ドラフトのみ）",
      "",
      "TiSLY TOMS業務PWA",
    ].join("\n"),
    attachmentPaths: [attachEstimate],
    status: "draft",
    createdAt: new Date().toISOString(),
  };
}

export function createInvoiceAndReportMailDraft(
  project: BusinessProject,
  invoice: Invoice,
  completionReport: CompletionReport
): MailDraft {
  const invPath = invoice.pdfPath ?? generateQnapFilePath(project, "invoice", invoice.invoiceNo);
  const repPath =
    completionReport.pdfPath ??
    generateQnapFilePath(project, "completion_report", completionReport.id.slice(0, 8));
  return {
    id: uuid(),
    projectId: project.id,
    type: "invoice_and_report_to_owner",
    to: MAIL_TO,
    subject: `【完了・請求】${project.customerName}様 — ${project.title}`,
    body: [
      "山中方様",
      "",
      "工事完了のご報告と請求書をお送りします。",
      "",
      `案件: ${project.title}`,
      `請求番号: ${invoice.invoiceNo}`,
      `税込合計: ¥${invoice.total.toLocaleString("ja-JP")}`,
      `入金予定: ${invoice.paymentDueDate ?? project.paymentDueDate ?? "未設定"}`,
      "",
      "添付予定:",
      `- 完了報告書`,
      `- 請求書`,
      "",
      "※ Phase521–540: 実送信は未接続（ドラフトのみ）",
    ].join("\n"),
    attachmentPaths: [repPath, invPath],
    status: "draft",
    createdAt: new Date().toISOString(),
  };
}

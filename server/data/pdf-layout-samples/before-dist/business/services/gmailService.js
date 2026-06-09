import { v4 as uuid } from "uuid";
import { DEFAULT_MAIL_TO as MAIL_TO } from "../business-types.js";
import { generateQnapFilePath } from "./qnapService.js";
export class MockGmailProvider {
    async sendDraft(draft) {
        return { messageId: `mock-gmail-${draft.id}`, status: "draft" };
    }
}
let gmailProvider = new MockGmailProvider();
export function setGmailProvider(provider) {
    gmailProvider = provider;
}
export function getGmailProvider() {
    return gmailProvider;
}
const PLACEHOLDER_ATTACH = (label) => `/attachments/placeholder/${label}.pdf`;
export function createEstimateMailDraft(project, estimate) {
    const attachEstimate = estimate.pdfPath ?? generateQnapFilePath(project, "estimate", estimate.estimateNo);
    return {
        id: uuid(),
        projectId: project.id,
        type: "estimate_ready",
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
            "※ Phase541–560: Gmail mock（ドラフトのみ）",
            "",
            "TiSLY TOMS業務PWA",
        ].join("\n"),
        attachmentPaths: [attachEstimate, PLACEHOLDER_ATTACH("estimate")],
        status: "draft",
        createdAt: new Date().toISOString(),
    };
}
export function createCompletionMailDraft(project, completionReport) {
    const repPath = completionReport.pdfPath ??
        generateQnapFilePath(project, "completion_report", completionReport.id.slice(0, 8));
    return {
        id: uuid(),
        projectId: project.id,
        type: "completion_ready",
        to: MAIL_TO,
        subject: `【完了報告】${project.customerName}様 — ${project.title}`,
        body: [
            "山中方様",
            "",
            "工事完了報告書を作成しました。ご確認ください。",
            "",
            `案件: ${project.title}`,
            `報告: ${completionReport.title}`,
            completionReport.workMemo ? `作業メモ: ${completionReport.workMemo}` : "",
            "",
            "※ Phase541–560: Gmail mock（ドラフトのみ）",
        ]
            .filter(Boolean)
            .join("\n"),
        attachmentPaths: [repPath, PLACEHOLDER_ATTACH("completion-report")],
        status: "draft",
        createdAt: new Date().toISOString(),
    };
}
export function createInvoiceMailDraft(project, invoice) {
    const invPath = invoice.pdfPath ?? generateQnapFilePath(project, "invoice", invoice.invoiceNo);
    return {
        id: uuid(),
        projectId: project.id,
        type: "invoice_ready",
        to: MAIL_TO,
        subject: `【請求】${project.customerName}様 — ${project.title}（${invoice.invoiceNo}）`,
        body: [
            "山中方様",
            "",
            "請求書をお送りします。",
            "",
            `案件: ${project.title}`,
            `請求番号: ${invoice.invoiceNo}`,
            `税込合計: ¥${invoice.total.toLocaleString("ja-JP")}`,
            `入金予定: ${invoice.paymentDueDate ?? project.paymentDueDate ?? "未設定"}`,
            "",
            "※ Phase541–560: Gmail mock（ドラフトのみ）",
        ].join("\n"),
        attachmentPaths: [invPath, PLACEHOLDER_ATTACH("invoice")],
        status: "draft",
        createdAt: new Date().toISOString(),
    };
}
/** @deprecated Phase521 互換 */
export function createInvoiceAndReportMailDraft(project, invoice, completionReport) {
    const inv = createInvoiceMailDraft(project, invoice);
    const repPath = completionReport.pdfPath ??
        generateQnapFilePath(project, "completion_report", completionReport.id.slice(0, 8));
    return {
        ...inv,
        type: "invoice_and_report_to_owner",
        subject: `【完了・請求】${project.customerName}様 — ${project.title}`,
        body: [
            inv.body,
            "",
            "添付予定:",
            "- 完了報告書",
            "- 請求書",
        ].join("\n"),
        attachmentPaths: [...new Set([...inv.attachmentPaths, repPath])],
    };
}
export async function sendMailDraft(draft) {
    await gmailProvider.sendDraft(draft);
    return draft;
}

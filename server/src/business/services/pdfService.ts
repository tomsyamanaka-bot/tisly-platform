import fs from "fs";
import path from "path";
import type { BusinessProject, CompletionReport, Estimate, Invoice } from "../business-types.js";
import { businessUploadsDir } from "../business-store.js";
import { generateQnapFilePath } from "./qnapService.js";

function minimalPdfBuffer(title: string, lines: string[]): Buffer {
  const text = [title, "", ...lines].join("\n");
  const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const stream = `BT /F1 12 Tf 50 750 Td (${escaped.slice(0, 500)}) Tj ET`;
  const pdf = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>endobj
4 0 obj<< /Length ${stream.length} >>stream
${stream}
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
trailer<< /Size 5 /Root 1 0 R >>
startxref
400
%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function writePdf(projectId: string, folder: string, fileName: string, buf: Buffer): string {
  const dir = businessUploadsDir(projectId, folder);
  const full = path.join(dir, fileName);
  fs.writeFileSync(full, buf);
  return `/uploads/business/${projectId}/${folder}/${fileName}`;
}

export function generateEstimatePdf(project: BusinessProject, estimate: Estimate): string {
  const buf = minimalPdfBuffer(`見積書 ${estimate.estimateNo}`, [
    `お客様: ${estimate.customerName}`,
    `件名: ${estimate.title}`,
    `小計: ¥${estimate.subtotal}`,
    `税: ¥${estimate.tax}`,
    `合計: ¥${estimate.total}`,
    `粗利: ¥${estimate.grossProfit} (${estimate.grossProfitRate}%)`,
    "— TiSLY TOMS 簡易PDF (Phase521-540)",
  ]);
  const fileName = path.basename(generateQnapFilePath(project, "estimate", estimate.estimateNo));
  return writePdf(project.id, "pdfs", fileName, buf);
}

export function generateInvoicePdf(project: BusinessProject, invoice: Invoice): string {
  const buf = minimalPdfBuffer(`請求書 ${invoice.invoiceNo}`, [
    `お客様: ${invoice.customerName}`,
    `件名: ${invoice.title}`,
    `合計: ¥${invoice.total}`,
    `支払期限: ${invoice.paymentDueDate ?? ""}`,
    invoice.bankInfo,
    "— TiSLY TOMS 簡易PDF (Phase521-540)",
  ]);
  const fileName = path.basename(generateQnapFilePath(project, "invoice", invoice.invoiceNo));
  return writePdf(project.id, "pdfs", fileName, buf);
}

export function generateCompletionReportPdf(
  project: BusinessProject,
  report: CompletionReport
): string {
  const buf = minimalPdfBuffer(`完了報告 ${report.title}`, [
    `案件: ${project.title}`,
    `お客様: ${project.customerName}`,
    report.workMemo,
    `施工前写真: ${report.beforePhotos.length}枚`,
    `施工後写真: ${report.afterPhotos.length}枚`,
    "— TiSLY TOMS 簡易PDF (Phase521-540)",
  ]);
  const fileName = path.basename(generateQnapFilePath(project, "completion_report"));
  return writePdf(project.id, "pdfs", fileName, buf);
}

import { renderEstimateHtml } from "./estimate-template.js";
import { renderInvoiceHtml } from "./invoice-template.js";
import { analyzePdfBuffer, PDF_MIN_BYTES } from "./pdf-validation.js";
import { htmlToPdfBuffer } from "./render.js";
import { getPdfEngineHealthSnapshot } from "./pdf-engine-status.js";
import { renderSpecificationHtml } from "../../estimate/specification-template.js";
import { renderPracticalCompletionReportHtml } from "../../estimate/practical-completion-report-template.js";
import type { BusinessProject, Estimate, Invoice } from "../business-types.js";

export interface PdfTypeDiagnosticV1 {
  kind: "estimate" | "invoice" | "specification" | "completion";
  label: string;
  status: "ok" | "ng";
  htmlOk: boolean;
  pdfOk: boolean;
  sizeBytes: number;
  pageCount: number;
  detail: string;
}

export interface PdfDiagnosticsResponseV1 {
  checkedAt: string;
  pdfEngine: string;
  pdfEngineReady: boolean;
  pdfLastError: string | null;
  blobGeneration: "ok" | "ng";
  types: PdfTypeDiagnosticV1[];
}

const sampleProject: BusinessProject = {
  id: "pdf-diag",
  projectNo: "MO-26-0622-001",
  customerId: "c1",
  customerName: "診断テスト様",
  title: "PDF診断テスト現場",
  address: "茨城県守谷市",
  phone: "",
  status: "estimate_created",
  surveySchedule: null,
  surveyMemo: "",
  surveyPhotos: [],
  estimateId: "e-diag",
  constructionSchedule: null,
  requiredMaterials: "",
  constructionMemo: "",
  constructionPhotos: [],
  completionReportId: null,
  invoiceId: "i-diag",
  paymentDueDate: null,
  paidDate: null,
  qnapBasePath: "",
  surveyProjectId: null,
  municipality: "",
  assignee: "",
  qnapFolderPath: "",
  qnapSyncStatus: "pending",
  standaloneDocKind: null,
  createdAt: "2026-06-22T00:00:00.000Z",
  updatedAt: "2026-06-22T00:00:00.000Z",
};

const sampleEstimate: Estimate = {
  id: "e-diag",
  projectId: "pdf-diag",
  estimateNo: "260622-001",
  title: "PDF診断テスト現場",
  customerName: "診断テスト様",
  items: [
    { id: "1", category: "other", name: "防犯カメラ設置", unit: "式", quantity: 1, unitPrice: 100000, amount: 100000 },
  ],
  lineSubtotal: 100000,
  shuseiDiscount: 0,
  shuseiDiscountMemo: "",
  subtotal: 100000,
  tax: 10000,
  total: 110000,
  header: {
    addressee: "診断テスト様",
    subject: "PDF診断テスト現場",
    issueDate: "2026/06/22",
    estimateNo: "260622-001",
    staffName: "山中 智紀",
    workLocation: "茨城県守谷市",
    siteName: "PDF診断テスト現場",
  },
  internalCost: 0,
  grossProfit: 0,
  grossProfitRate: 0,
  pdfPath: null,
  createdAt: "2026-06-22T00:00:00.000Z",
  updatedAt: "2026-06-22T00:00:00.000Z",
};

const sampleInvoice: Invoice = {
  id: "i-diag",
  projectId: "pdf-diag",
  invoiceNo: "260622-002",
  title: "PDF診断テスト現場",
  customerName: "診断テスト様",
  items: sampleEstimate.items,
  subtotal: 100000,
  tax: 10000,
  total: 110000,
  bankInfo: "常陽銀行 越谷支店\n普通 1370414\nトムズ",
  paymentDueDate: null,
  pdfPath: null,
  createdAt: "2026-06-22T00:00:00.000Z",
  updatedAt: "2026-06-22T00:00:00.000Z",
};

function samplePhotos(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="100%" height="100%" fill="#cbd5e1"/><text x="50%" y="50%" text-anchor="middle" fill="#334155" font-size="14">写真${i + 1}</text></svg>`)}`,
    title: `写真${i + 1}`,
  }));
}

async function diagnoseHtmlPdf(
  kind: PdfTypeDiagnosticV1["kind"],
  label: string,
  html: string
): Promise<PdfTypeDiagnosticV1> {
  const htmlOk =
    html.length > 200 &&
    !html.includes("Google予定から自動生成") &&
    (kind !== "estimate" || (!html.includes("インボイス番号") && html.includes("株式会社TOMS"))) &&
    (kind !== "invoice" || (html.includes("トムズ") && !html.includes("トムス"))) &&
    (kind !== "specification" || (html.includes("現場名") && html.includes("工事内容")));

  let pdfOk = false;
  let sizeBytes = 0;
  let pageCount = 0;
  let detail = "";

  try {
    const buf = await htmlToPdfBuffer(html);
    if (!buf) {
      detail = "html_fallback（Puppeteer未使用）";
      pdfOk = htmlOk;
    } else {
      const analysis = analyzePdfBuffer(buf);
      sizeBytes = analysis.sizeBytes;
      pageCount = analysis.pageCount;
      pdfOk = analysis.valid && analysis.sizeBytes >= PDF_MIN_BYTES;
      detail = pdfOk
        ? `${analysis.sizeBytes} byte · ${analysis.pageCount} page`
        : `invalid: size=${analysis.sizeBytes} pages=${analysis.pageCount}`;
    }
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e);
    pdfOk = false;
  }

  return {
    kind,
    label,
    status: htmlOk && pdfOk ? "ok" : "ng",
    htmlOk,
    pdfOk,
    sizeBytes,
    pageCount,
    detail,
  };
}

export async function runPdfDiagnosticsV1(): Promise<PdfDiagnosticsResponseV1> {
  const engine = getPdfEngineHealthSnapshot();
  let blobGeneration: "ok" | "ng" = "ok";
  try {
    const probe = Buffer.from("%PDF-1.4");
    if (!probe || probe.length < 4) blobGeneration = "ng";
  } catch {
    blobGeneration = "ng";
  }

  const estimateHtml = renderEstimateHtml(sampleProject, sampleEstimate);
  const invoiceHtml = renderInvoiceHtml(sampleProject, sampleInvoice, sampleEstimate);
  const specificationHtml = renderSpecificationHtml({
    projectNo: sampleProject.projectNo,
    addressee: "診断テスト様",
    subject: "PDF診断テスト現場",
    siteName: "PDF診断テスト現場",
    workLocation: "茨城県守谷市",
    issueDate: "2026/06/22",
    staffName: "山中 智紀",
    generatedAt: new Date().toISOString(),
    systemConfig: "防犯カメラ",
    equipmentList: "・防犯カメラ: 屋外カメラ × 4",
    ipList: "—",
    notes: "現調メモ",
    photos: samplePhotos(4),
    drawings: [],
  });
  const completionHtml = renderPracticalCompletionReportHtml({
    projectNo: sampleProject.projectNo,
    addressee: "診断テスト様",
    subject: "PDF診断テスト現場",
    siteName: "PDF診断テスト現場",
    workLocation: "茨城県守谷市",
    issueDate: "2026/06/22",
    staffName: "山中 智紀",
    generatedAt: new Date().toISOString(),
    photos: samplePhotos(3),
  });

  const types = await Promise.all([
    diagnoseHtmlPdf("estimate", "見積PDF", estimateHtml),
    diagnoseHtmlPdf("invoice", "請求PDF", invoiceHtml),
    diagnoseHtmlPdf("specification", "仕様書PDF", specificationHtml),
    diagnoseHtmlPdf("completion", "完了報告PDF", completionHtml),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    pdfEngine: engine.pdfEngine,
    pdfEngineReady: engine.pdfEngineReady,
    pdfLastError: engine.pdfLastError,
    blobGeneration,
    types,
  };
}

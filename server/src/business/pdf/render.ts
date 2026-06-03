import fs from "fs";
import path from "path";
import type { BusinessProject, CompletionReport, Estimate, Invoice } from "../business-types.js";
import { businessUploadsDir } from "../business-store.js";
import { logBusinessIntegration } from "../business-integration-log.js";
import { renderCompletionReportHtml } from "./completion-report-template.js";
import { renderEstimateHtml } from "./estimate-template.js";
import { renderInvoiceHtml } from "./invoice-template.js";

export type PdfDocumentKind =
  | "estimate"
  | "invoice"
  | "completion_report"
  | "specification";

export type PdfRenderMode = "html" | "puppeteer";

export function getPdfRenderMode(): PdfRenderMode {
  if (process.env.TISLY_PDF_PUPPETEER === "true") return "puppeteer";
  return "html";
}

async function htmlToPdfBuffer(html: string): Promise<Buffer | null> {
  if (getPdfRenderMode() !== "puppeteer") return null;
  try {
    const puppeteer = (await import("puppeteer" as string)) as {
      default: {
        launch: (opts: { headless: boolean }) => Promise<{
          newPage: () => Promise<{
            setContent: (h: string, o: { waitUntil: string }) => Promise<void>;
            pdf: (o: { format: string; printBackground: boolean }) => Promise<Uint8Array>;
          }>;
          close: () => Promise<void>;
        }>;
      };
    };
    const browser = await puppeteer.default.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const buf = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();
    return Buffer.from(buf);
  } catch {
    return null;
  }
}

function writeHtmlFile(projectId: string, name: string, html: string): string {
  const dir = businessUploadsDir(projectId, "pdf-html");
  const full = path.join(dir, name);
  fs.writeFileSync(full, html, "utf8");
  return `/uploads/business/${projectId}/pdf-html/${name}`;
}

function minimalPdfBuffer(title: string): Buffer {
  const escaped = title.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const stream = `BT /F1 12 Tf 50 750 Td (${escaped.slice(0, 200)}) Tj ET`;
  const pdf = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>endobj
4 0 obj<< /Length ${stream.length} >>stream
${stream}
endstream endobj
trailer<< /Size 5 /Root 1 0 R >>
startxref
300
%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export interface RenderedBusinessPdf {
  htmlPath: string;
  pdfPath: string | null;
  contentType: "application/pdf" | "text/html; charset=utf-8";
  localPath: string;
}

export async function renderBusinessPdf(
  kind: PdfDocumentKind,
  project: BusinessProject,
  doc: Estimate | Invoice | CompletionReport
): Promise<RenderedBusinessPdf> {
  const html =
    kind === "estimate"
      ? renderEstimateHtml(project, doc as Estimate)
      : kind === "invoice"
        ? renderInvoiceHtml(project, doc as Invoice)
        : renderCompletionReportHtml(project, doc as CompletionReport);
  const htmlName = `${kind}-toms.html`;
  const htmlPath = writeHtmlFile(project.id, htmlName, html);
  const pdfBuf =
    (await htmlToPdfBuffer(html)) ??
    minimalPdfBuffer(
      kind === "estimate"
        ? `見積 ${(doc as Estimate).estimateNo}`
        : kind === "invoice"
          ? `請求 ${(doc as Invoice).invoiceNo}`
          : `完了報告`
    );
  const pdfDir = businessUploadsDir(project.id, "pdfs");
  const pdfName = `${kind}-${project.id.slice(-4)}.pdf`;
  const localPdf = path.join(pdfDir, pdfName);
  fs.writeFileSync(localPdf, pdfBuf);
  const pdfPath = `/uploads/business/${project.id}/pdfs/${pdfName}`;
  const mode = getPdfRenderMode();
  logBusinessIntegration({
    projectId: project.id,
    type: "pdf",
    provider: mode === "puppeteer" ? "puppeteer" : "html",
    status: "success",
    request: { kind },
    response: { htmlPath, pdfPath },
  });
  return {
    htmlPath,
    pdfPath,
    contentType: "application/pdf",
    localPath: localPdf,
  };
}

export function renderSpecificationHtml(
  project: BusinessProject,
  specNo: string,
  title: string
): string {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/>
<title>${title}</title><style>body{font-family:sans-serif;padding:2rem;color:#222}
h1{font-size:1.4rem}table{width:100%;border-collapse:collapse;margin-top:1rem}
td,th{border:1px solid #ccc;padding:0.5rem}</style></head><body>
<h1>仕様書 ${specNo}</h1>
<p>案件: ${project.title}</p>
<p>顧客: ${project.customerName}</p>
<p>住所: ${project.address}</p>
<p class="meta">TOMS標準PDFテンプレート v1 · ${new Date().toISOString().slice(0, 10)}</p>
</body></html>`;
}

export async function renderSpecificationPdf(
  project: BusinessProject,
  specNo: string,
  title: string
): Promise<RenderedBusinessPdf> {
  const html = renderSpecificationHtml(project, specNo, title);
  const htmlPath = writeHtmlFile(project.id, "specification-toms.html", html);
  const pdfBuf =
    (await htmlToPdfBuffer(html)) ?? minimalPdfBuffer(`仕様書 ${specNo}`);
  const pdfDir = businessUploadsDir(project.id, "specifications");
  const pdfName = `${specNo.replace(/[^\w-]/g, "_")}.pdf`;
  const localPdf = path.join(pdfDir, pdfName);
  fs.writeFileSync(localPdf, pdfBuf);
  const pdfPath = `/uploads/business/${project.id}/specifications/${pdfName}`;
  const mode = getPdfRenderMode();
  logBusinessIntegration({
    projectId: project.id,
    type: "pdf",
    provider: mode === "puppeteer" ? "puppeteer" : "html",
    status: "success",
    request: { kind: "specification", dryRun: mode !== "puppeteer", mockOnly: mode !== "puppeteer" },
    response: { htmlPath, pdfPath },
  });
  return {
    htmlPath,
    pdfPath,
    contentType: "application/pdf",
    localPath: localPdf,
  };
}

export interface UnifiedPdfPipelineResult extends RenderedBusinessPdf {
  kind: PdfDocumentKind | "specification";
  renderMode: PdfRenderMode;
  previewUrl: string;
}

export async function runUnifiedPdfPipeline(
  kind: PdfDocumentKind,
  project: BusinessProject,
  doc: Estimate | Invoice | CompletionReport
): Promise<UnifiedPdfPipelineResult> {
  const rendered = await renderBusinessPdf(kind, project, doc);
  return {
    ...rendered,
    kind,
    renderMode: getPdfRenderMode(),
    previewUrl: rendered.htmlPath,
  };
}

export function getRenderedHtmlPath(projectId: string, kind: PdfDocumentKind): string | null {
  const p = path.join(process.cwd(), "uploads", "business", projectId, "pdf-html", `${kind}-toms.html`);
  return fs.existsSync(p) ? p : null;
}

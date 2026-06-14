import fs from "fs";
import path from "path";
import type { BusinessProject, CompletionReport, Estimate, Invoice } from "../business-types.js";
import { businessUploadsDir, getEstimate } from "../business-store.js";
import { logBusinessIntegration } from "../business-integration-log.js";
import { assertValidPdfBuffer, PDF_GENERATION_FAILED_MSG } from "./pdf-validation.js";
import {
  notePdfGenerationError,
  notePdfGenerationSuccess,
  probePdfEngineHealth,
  getPdfEngineHealthSnapshot,
} from "./pdf-engine-status.js";
import { PUPPETEER_LAUNCH_ARGS, resolveChromiumExecutablePath } from "./chromium-path.js";
import { embedPdfImagesInHtml } from "./pdf-image-embed.js";
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
  if (process.env.TISLY_PDF_PUPPETEER === "false") return "html";
  try {
    const puppeteerDir = path.join(process.cwd(), "node_modules", "puppeteer");
    if (fs.existsSync(puppeteerDir)) return "puppeteer";
  } catch {
    /* ignore */
  }
  return "html";
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer | null> {
  if (process.env.TISLY_PDF_PUPPETEER === "false") return null;
  const executablePath = resolveChromiumExecutablePath() ?? undefined;
  try {
    const puppeteer = (await import("puppeteer" as string)) as {
      default: {
        launch: (opts: {
          headless: boolean | "shell";
          args: string[];
          executablePath?: string;
        }) => Promise<{
          newPage: () => Promise<{
            setViewport: (opts: {
              width: number;
              height: number;
              deviceScaleFactor: number;
            }) => Promise<void>;
            setDefaultNavigationTimeout: (ms: number) => void;
            setDefaultTimeout: (ms: number) => void;
            setContent: (h: string, o: { waitUntil: string }) => Promise<void>;
            evaluateHandle: (fn: string) => Promise<{ jsonValue: () => Promise<unknown> }>;
            pdf: (o: {
              format: string;
              landscape?: boolean;
              printBackground: boolean;
            }) => Promise<Uint8Array>;
          }>;
          close: () => Promise<void>;
        }>;
        executablePath?: () => string;
      };
    };
    const resolvedPath =
      executablePath ??
      (typeof puppeteer.default.executablePath === "function"
        ? puppeteer.default.executablePath()
        : undefined);
    if (!resolvedPath) {
      throw new Error("Chromium executable not found");
    }
    const browser = await puppeteer.default.launch({
      headless: true,
      args: PUPPETEER_LAUNCH_ARGS,
      executablePath: resolvedPath,
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
      page.setDefaultNavigationTimeout(90_000);
      page.setDefaultTimeout(90_000);
      await page.setContent(embedPdfImagesInHtml(html), { waitUntil: "load" });
      await page.evaluateHandle("document.fonts.ready");
      const buf = await page.pdf({ format: "A4", landscape: false, printBackground: true });
      const pdfBuf = Buffer.from(buf);
      notePdfGenerationSuccess(resolvedPath ?? null);
      return pdfBuf;
    } finally {
      await browser.close();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    notePdfGenerationError(message);
    logBusinessIntegration({
      type: "pdf",
      provider: "puppeteer",
      status: "error",
      errorMessage: message,
      response: { noFallback: true },
    });
    return null;
  }
}

/** HTML → Puppeteer PDF。失敗時は保存せずエラー（HTMLプレビューURLをPDFとして返さない） */
export async function renderWithPdfFallback(
  html: string,
  _title: string
): Promise<{ pdfBuf: Buffer; usedFallback: boolean; renderMode: PdfRenderMode }> {
  const engine = await probePdfEngineHealth();
  if (!engine.pdfEngineReady || engine.pdfEngine !== "puppeteer") {
    throw new Error(engine.pdfLastError ?? PDF_GENERATION_FAILED_MSG);
  }

  const puppeteerBuf = await htmlToPdfBuffer(html);
  if (puppeteerBuf) {
    assertValidPdfBuffer(puppeteerBuf);
    return { pdfBuf: puppeteerBuf, usedFallback: false, renderMode: "puppeteer" };
  }
  const lastErr = getPdfEngineHealthSnapshot().pdfLastError;
  throw new Error(lastErr ?? PDF_GENERATION_FAILED_MSG);
}

function writeHtmlFile(projectId: string, name: string, html: string): string {
  const dir = businessUploadsDir(projectId, "pdf-html");
  const full = path.join(dir, name);
  fs.writeFileSync(full, html, "utf8");
  return `/uploads/business/${projectId}/pdf-html/${name}`;
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
        ? (() => {
            if (!project.estimateId) throw new Error("estimate required for invoice pdf");
            const estimate = getEstimate(project.estimateId);
            if (!estimate) throw new Error("estimate required for invoice pdf");
            return renderInvoiceHtml(project, doc as Invoice, estimate);
          })()
        : renderCompletionReportHtml(project, doc as CompletionReport);
  const htmlName = `${kind}-toms.html`;
  const htmlPath = writeHtmlFile(project.id, htmlName, html);
  const title =
    kind === "estimate"
      ? `見積 ${(doc as Estimate).estimateNo}`
      : kind === "invoice"
        ? `請求 ${(doc as Invoice).invoiceNo}`
        : `完了報告`;
  const { pdfBuf } = await renderWithPdfFallback(html, title);
  assertValidPdfBuffer(pdfBuf);
  const pdfDir = businessUploadsDir(project.id, "pdfs");
  const pdfName = `${kind}-${project.id.slice(-4)}.pdf`;
  const localPdf = path.join(pdfDir, pdfName);
  fs.writeFileSync(localPdf, pdfBuf);
  const pdfPath = `/uploads/business/${project.id}/pdfs/${pdfName}`;
  logBusinessIntegration({
    projectId: project.id,
    type: "pdf",
    provider: "puppeteer",
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
  const { pdfBuf } = await renderWithPdfFallback(html, `仕様書 ${specNo}`);
  assertValidPdfBuffer(pdfBuf);
  const pdfDir = businessUploadsDir(project.id, "specifications");
  const pdfName = `${specNo.replace(/[^\w-]/g, "_")}.pdf`;
  const localPdf = path.join(pdfDir, pdfName);
  fs.writeFileSync(localPdf, pdfBuf);
  const pdfPath = `/uploads/business/${project.id}/specifications/${pdfName}`;
  logBusinessIntegration({
    projectId: project.id,
    type: "pdf",
    provider: "puppeteer",
    status: "success",
    request: { kind: "specification" },
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
    renderMode: "puppeteer",
    previewUrl: rendered.htmlPath,
  };
}

export function getRenderedHtmlPath(projectId: string, kind: PdfDocumentKind): string | null {
  const p = path.join(process.cwd(), "uploads", "business", projectId, "pdf-html", `${kind}-toms.html`);
  return fs.existsSync(p) ? p : null;
}

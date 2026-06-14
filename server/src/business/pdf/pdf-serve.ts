import fs from "fs";
import path from "path";
import type { Response } from "express";
import { isValidPdfFile, PDF_GENERATION_FAILED_MSG } from "./pdf-validation.js";

export interface PdfServeDebugContext {
  documentType: string;
  projectId?: string;
}

function readHead20Bytes(filePath: string): string {
  try {
    const buf = fs.readFileSync(filePath);
    return buf.subarray(0, 20).toString("latin1");
  } catch {
    return "";
  }
}

/** サーバー PDF 配信・失敗時の一時デバッグログ */
export function logPdfApiError(
  documentType: string,
  projectId: string,
  status: number,
  error: string,
  extra?: { contentType?: string; contentLength?: number; url?: string }
): void {
  console.warn(
    "[PDF DEBUG]",
    JSON.stringify({
      documentType,
      projectId,
      status,
      contentType: extra?.contentType ?? "application/json",
      contentLength: extra?.contentLength ?? error.length,
      error,
      url: extra?.url,
    })
  );
}

export function logPdfServeDebug(
  ctx: PdfServeDebugContext,
  filePath: string,
  status: number,
  contentType: string,
  contentLength: number
): void {
  console.log(
    "[PDF DEBUG]",
    JSON.stringify({
      documentType: ctx.documentType,
      projectId: ctx.projectId ?? null,
      status,
      contentType,
      contentLength,
      head20: readHead20Bytes(filePath),
    })
  );
}

export function sendPdfFile(
  res: Response,
  filePath: string,
  downloadName?: string,
  debug?: PdfServeDebugContext
): void {
  if (!isValidPdfFile(filePath)) {
    if (debug) {
      logPdfApiError(debug.documentType, debug.projectId ?? "", 500, PDF_GENERATION_FAILED_MSG, {
        contentType: "application/json",
      });
    }
    res.status(500).json({ error: PDF_GENERATION_FAILED_MSG });
    return;
  }
  const stat = fs.statSync(filePath);
  const name = downloadName ?? path.basename(filePath);
  const contentType = "application/pdf";
  const contentLength = stat.size;
  if (debug) {
    logPdfServeDebug(debug, filePath, 200, contentType, contentLength);
  }
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", String(contentLength));
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.sendFile(filePath);
}

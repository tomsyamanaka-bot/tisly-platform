import fs from "fs";
import path from "path";
import type { Response } from "express";
import { isValidPdfFile, PDF_GENERATION_FAILED_MSG } from "./pdf-validation.js";

export function sendPdfFile(res: Response, filePath: string, downloadName?: string): void {
  if (!isValidPdfFile(filePath)) {
    res.status(500).json({ error: PDF_GENERATION_FAILED_MSG });
    return;
  }
  const stat = fs.statSync(filePath);
  const name = downloadName ?? path.basename(filePath);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.sendFile(filePath);
}

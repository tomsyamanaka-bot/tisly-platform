import fs from "fs";

export const PDF_GENERATION_FAILED_MSG = "PDF生成に失敗しました。再生成してください";

export function isValidPdfBuffer(buf: Buffer | null | undefined): boolean {
  if (!buf || buf.length < 100) return false;
  return buf.subarray(0, 5).toString("ascii") === "%PDF-";
}

export function isValidPdfFile(filePath: string | null | undefined): boolean {
  if (!filePath?.trim()) return false;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < 100) return false;
    const head = Buffer.alloc(5);
    const fd = fs.openSync(filePath, "r");
    try {
      fs.readSync(fd, head, 0, 5, 0);
    } finally {
      fs.closeSync(fd);
    }
    return head.toString("ascii") === "%PDF-";
  } catch {
    return false;
  }
}

export function assertValidPdfBuffer(buf: Buffer): void {
  if (!isValidPdfBuffer(buf)) {
    throw new Error(PDF_GENERATION_FAILED_MSG);
  }
}

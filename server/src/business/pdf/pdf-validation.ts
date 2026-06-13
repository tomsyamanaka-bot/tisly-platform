import fs from "fs";
import zlib from "zlib";

export const PDF_GENERATION_FAILED_MSG = "PDF生成に失敗しました。再生成してください";
export const PDF_MIN_BYTES = 1000;

export interface PdfValidationResult {
  valid: boolean;
  pageCount: number;
  hasContent: boolean;
  sizeBytes: number;
}

function countPdfPages(text: string): number {
  const countMatches = [...text.matchAll(/\/Count\s+(\d+)/g)];
  if (!countMatches.length) return 0;
  return Math.max(...countMatches.map((m) => parseInt(m[1], 10)).filter((n) => Number.isFinite(n)));
}

function streamTextHasContent(text: string): boolean {
  if (/\bTj\b/.test(text) || /\bTJ\b/.test(text) || /\bDo\b/.test(text)) return true;
  if (/\/Subtype\s*\/Image\b/.test(text) || /\/Image\b/.test(text)) return true;
  return false;
}

/** PDF 内の content stream を展開して文字/画像命令を探す */
function pdfBufferHasPageContent(buf: Buffer): boolean {
  const plain = buf.toString("latin1");
  if (streamTextHasContent(plain)) return true;

  const streamToken = Buffer.from("stream");
  const endToken = Buffer.from("endstream");
  let pos = 0;
  while (pos < buf.length) {
    const streamIdx = buf.indexOf(streamToken, pos);
    if (streamIdx < 0) break;

    let dataStart = streamIdx + streamToken.length;
    if (buf[dataStart] === 0x0d && buf[dataStart + 1] === 0x0a) dataStart += 2;
    else if (buf[dataStart] === 0x0a) dataStart += 1;

    const endIdx = buf.indexOf(endToken, dataStart);
    if (endIdx < 0) break;

    const header = buf.subarray(Math.max(0, streamIdx - 400), streamIdx).toString("latin1");
    const raw = buf.subarray(dataStart, endIdx);
    let decoded = raw;
    if (header.includes("FlateDecode")) {
      try {
        decoded = zlib.inflateSync(raw);
      } catch {
        decoded = raw;
      }
    }
    if (streamTextHasContent(decoded.toString("latin1"))) return true;
    pos = endIdx + endToken.length;
  }
  return false;
}

/** PDF バイナリの実体検証（Safari 白紙防止） */
export function analyzePdfBuffer(buf: Buffer | null | undefined): PdfValidationResult {
  const sizeBytes = buf?.length ?? 0;
  if (!buf || sizeBytes < PDF_MIN_BYTES) {
    return { valid: false, pageCount: 0, hasContent: false, sizeBytes };
  }
  if (buf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return { valid: false, pageCount: 0, hasContent: false, sizeBytes };
  }

  const text = buf.toString("latin1");
  const pageCount = countPdfPages(text);
  const hasContent = pdfBufferHasPageContent(buf);

  return {
    valid: pageCount >= 1 && hasContent,
    pageCount,
    hasContent,
    sizeBytes,
  };
}

export function isValidPdfBuffer(buf: Buffer | null | undefined): boolean {
  return analyzePdfBuffer(buf).valid;
}

export function isValidPdfFile(filePath: string | null | undefined): boolean {
  if (!filePath?.trim()) return false;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < PDF_MIN_BYTES) return false;
    const buf = fs.readFileSync(filePath);
    return isValidPdfBuffer(buf);
  } catch {
    return false;
  }
}

export function assertValidPdfBuffer(buf: Buffer): void {
  if (!isValidPdfBuffer(buf)) {
    throw new Error(PDF_GENERATION_FAILED_MSG);
  }
}

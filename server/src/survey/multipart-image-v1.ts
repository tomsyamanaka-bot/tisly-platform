/**
 * multipart/form-data から画像パートを抽出
 * multer なしで file / image キーを確実に取る
 */
import type { Request } from "express";

export interface MultipartImagePartV1 {
  fieldName: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
}

export interface MultipartParseResultV1 {
  fields: Record<string, string>;
  files: MultipartImagePartV1[];
}

/** Content-Type から boundary を取り出す */
function extractBoundary(contentType: string): string | null {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) return null;
  return (m[1] || m[2] || "").trim() || null;
}

/** リクエスト本体を Buffer 化 */
export async function readRequestBodyBufferV1(req: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * multipart 生バッファをパース
 * file / image 名付きパートを優先取得する
 */
export function parseMultipartBufferV1(
  raw: Buffer,
  contentType: string
): MultipartParseResultV1 {
  const boundary = extractBoundary(contentType);
  if (!boundary) {
    return { fields: {}, files: [] };
  }

  const delim = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  const files: MultipartImagePartV1[] = [];
  let start = raw.indexOf(delim);

  while (start !== -1) {
    const afterDelim = start + delim.length;
    // 終端 --boundary--
    if (raw[afterDelim] === 0x2d && raw[afterDelim + 1] === 0x2d) {
      break;
    }
    // CRLF スキップ
    let partStart = afterDelim;
    if (raw[partStart] === 0x0d && raw[partStart + 1] === 0x0a) {
      partStart += 2;
    }

    const next = raw.indexOf(delim, partStart);
    if (next === -1) break;

    // パート末尾の CRLF を除く
    let partEnd = next;
    if (
      partEnd >= 2 &&
      raw[partEnd - 2] === 0x0d &&
      raw[partEnd - 1] === 0x0a
    ) {
      partEnd -= 2;
    }

    const part = raw.subarray(partStart, partEnd);
    const headerSep = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerSep === -1) {
      start = next;
      continue;
    }

    const headerText = part.subarray(0, headerSep).toString("utf8");
    const body = part.subarray(headerSep + 4);
    const nameMatch = /name="([^"]+)"/i.exec(headerText);
    const fileMatch = /filename="([^"]*)"/i.exec(headerText);
    const fieldName = nameMatch?.[1] || "";
    const fileName = fileMatch?.[1] ?? "";
    const mimeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerText);
    const mimeType = (mimeMatch?.[1] || "application/octet-stream").trim();

    if (fileMatch) {
      files.push({
        fieldName,
        fileName: fileName || "sketch.jpg",
        mimeType,
        data: Buffer.from(body),
      });
    } else if (fieldName) {
      fields[fieldName] = body.toString("utf8");
    }

    start = next;
  }

  return { fields, files };
}

/**
 * file / image / sketch の順で画像パートを選ぶ
 */
export function pickMultipartImageV1(
  parsed: MultipartParseResultV1
): MultipartImagePartV1 | null {
  const prefer = ["file", "image", "sketch", "photo"];
  for (const key of prefer) {
    const hit = parsed.files.find(
      (f) => f.fieldName === key && f.data.length > 32
    );
    if (hit) return hit;
  }
  return parsed.files.find((f) => f.data.length > 32) ?? null;
}

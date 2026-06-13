import fs from "fs";
import path from "path";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const MISSING_IMAGE_MARKER = "<!-- pdf-missing-image -->";

function guessMime(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "image/jpeg";
}

/** /uploads/... または絶対URLの uploads パスをローカルファイルへ */
export function resolveUploadUrlToLocalPath(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;

  let uploadPath: string | null = null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const pathname = new URL(trimmed).pathname;
      if (pathname.startsWith("/uploads/")) uploadPath = pathname;
    } catch {
      return null;
    }
  } else if (trimmed.startsWith("/uploads/")) {
    uploadPath = trimmed;
  } else if (trimmed.startsWith("uploads/")) {
    uploadPath = `/${trimmed}`;
  }

  if (!uploadPath) return null;
  return path.join(process.cwd(), uploadPath.replace(/^\//, ""));
}

export function fileToDataUrl(localPath: string): string | null {
  if (!fs.existsSync(localPath)) return null;
  try {
    const buf = fs.readFileSync(localPath);
    if (buf.length === 0) return null;
    return `data:${guessMime(localPath)};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export function resolveImageSrcToDataUrl(src: string): string | null {
  if (src.startsWith("data:")) return src;
  const local = resolveUploadUrlToLocalPath(src);
  if (!local) return null;
  return fileToDataUrl(local);
}

function removePhotoBlocksWithMissingMarker(html: string): string {
  return html
    .replace(/<div class="[^"]*-photo-cell">[\s\S]*?<!-- pdf-missing-image -->[\s\S]*?<\/div>/g, "")
    .replace(/<div class="photo-slot"[^>]*>[\s\S]*?<!-- pdf-missing-image -->[\s\S]*?<\/div>/g, "");
}

/** Puppeteer PDF 用: img src を base64 data URL に変換。失敗時は枠ごと除去してログ */
export function embedPdfImagesInHtml(html: string): string {
  let out = html.replace(
    /<img\b([^>]*?)\bsrc="([^"]+)"([^>]*)>/gi,
    (_match, before: string, src: string, after: string) => {
      const dataUrl = resolveImageSrcToDataUrl(src);
      if (!dataUrl) {
        console.warn(`[pdf] missing image: ${src}`);
        return MISSING_IMAGE_MARKER;
      }
      return `<img${before}src="${dataUrl}"${after}>`;
    }
  );
  out = removePhotoBlocksWithMissingMarker(out);
  return out.replaceAll(MISSING_IMAGE_MARKER, "");
}

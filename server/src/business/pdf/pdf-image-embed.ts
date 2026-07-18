import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const MISSING_IMAGE_MARKER = "<!-- pdf-missing-image -->";

function guessMime(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "image/jpeg";
}

function publicAssetsDirCandidates(): string[] {
  const fromModule = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "public",
    "assets"
  );
  return [
    fromModule,
    path.join(process.cwd(), "public", "assets"),
    path.join(process.cwd(), "server", "public", "assets"),
  ];
}

/** /assets/...（社判など静的アセット）をローカルファイルへ */
export function resolvePublicAssetUrlToLocalPath(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;

  let assetRel: string | null = null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const pathname = new URL(trimmed).pathname;
      if (pathname.startsWith("/assets/")) assetRel = pathname.slice("/assets/".length);
    } catch {
      return null;
    }
  } else if (trimmed.startsWith("/assets/")) {
    assetRel = trimmed.slice("/assets/".length);
  }

  if (!assetRel || assetRel.includes("..") || path.isAbsolute(assetRel)) return null;

  for (const dir of publicAssetsDirCandidates()) {
    const full = path.join(dir, assetRel);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/** /uploads/... または絶対URLの uploads パスをローカルファイルへ */
export function resolveUploadUrlToLocalPath(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;

  const assetLocal = resolvePublicAssetUrlToLocalPath(trimmed);
  if (assetLocal) return assetLocal;

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

  if (trimmed.startsWith("data/project-storage/")) {
    return path.join(process.cwd(), trimmed);
  }

  const apiMatch = trimmed.match(
    /\/api\/project-storage\/([^/?]+)\/file\?[^#]*relativePath=([^&#]+)/
  );
  if (apiMatch) {
    try {
      const projectId = decodeURIComponent(apiMatch[1]);
      const rel = decodeURIComponent(apiMatch[2]);
      return path.join(process.cwd(), "data", "project-storage", projectId, rel);
    } catch {
      return null;
    }
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

/**
 * ナレッジ添付の種別判定（PDF / 画像 / 動画）。
 * 既存の pdf_url フィールドに
 * 任意メディア URL を載せる前提。
 */

export type KnowledgeMediaKind = "pdf" | "image" | "video" | "unknown";

export interface KnowledgeMediaAttachment {
  url: string;
  fileName?: string;
  kind: KnowledgeMediaKind;
}

const IMAGE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".heif",
  ".webp",
]);
const VIDEO_EXTS = new Set([".mp4", ".mov"]);
const PDF_EXTS = new Set([".pdf"]);

/** 拡張子を小文字で取り出す */
export function mediaExtFromName(name: string): string {
  const base = String(name ?? "").split("?")[0].split("#")[0];
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot).toLowerCase();
}

/** ファイル名または URL から種別を推定 */
export function detectKnowledgeMediaKind(
  nameOrUrl: string,
  mimeType?: string
): KnowledgeMediaKind {
  const mime = String(mimeType ?? "").toLowerCase();
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";

  const ext = mediaExtFromName(nameOrUrl);
  if (PDF_EXTS.has(ext)) return "pdf";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  return "unknown";
}

/** 選択・DnD で許可する拡張子 */
export function isAllowedKnowledgeMediaFile(file: File): boolean {
  const kind = detectKnowledgeMediaKind(file.name, file.type);
  if (kind !== "unknown") return true;
  // MIME のみ（拡張子なし撮影など）
  const mime = String(file.type ?? "").toLowerCase();
  return (
    mime === "application/pdf" ||
    mime.startsWith("image/") ||
    mime.startsWith("video/")
  );
}

/** カード表示用ラベル */
export function knowledgeMediaLabel(kind: KnowledgeMediaKind): string {
  if (kind === "pdf") return "PDF";
  if (kind === "image") return "写真";
  if (kind === "video") return "動画";
  return "ファイル";
}

function normalizeMediaValue(raw: unknown): KnowledgeMediaAttachment | null {
  if (typeof raw === "string") {
    const url = raw.trim();
    if (!url) return null;
    const rawName = url.split("/").pop()?.split("?")[0] ?? "";
    let fileName = rawName;
    try {
      fileName = decodeURIComponent(rawName);
    } catch {
      /* URL 由来の表示名は元文字列を使う */
    }
    return {
      url,
      fileName,
      kind: detectKnowledgeMediaKind(url),
    };
  }
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const url = String(
    source.url ?? source.pdf_url ?? source.path ?? source.src ?? ""
  ).trim();
  if (!url) return null;
  const fileName = String(source.fileName ?? source.name ?? "").trim();
  const rawKind = String(source.kind ?? "");
  const kind: KnowledgeMediaKind =
    rawKind === "pdf" || rawKind === "image" || rawKind === "video"
      ? rawKind
      : detectKnowledgeMediaKind(fileName || url);
  return { url, ...(fileName ? { fileName } : {}), kind };
}

/**
 * files/medias 配列を優先し、旧単一フィールドを
 * 重複なしでフォールバック統合する。
 */
export function normalizeKnowledgeMediaAttachments(
  item: Record<string, unknown>
): KnowledgeMediaAttachment[] {
  const candidates: unknown[] = [];
  if (Array.isArray(item.medias)) candidates.push(...item.medias);
  if (Array.isArray(item.files)) candidates.push(...item.files);
  if (item.media != null) candidates.push(item.media);
  if (item.file != null) candidates.push(item.file);
  if (item.pdf_url != null) candidates.push(item.pdf_url);

  const byUrl = new Map<string, KnowledgeMediaAttachment>();
  for (const candidate of candidates) {
    const normalized = normalizeMediaValue(candidate);
    if (!normalized || byUrl.has(normalized.url)) continue;
    byUrl.set(normalized.url, normalized);
  }
  return [...byUrl.values()];
}

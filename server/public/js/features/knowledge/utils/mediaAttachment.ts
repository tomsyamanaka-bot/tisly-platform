/**
 * ナレッジ添付の種別判定（PDF / 画像 / 動画）。
 * 既存の pdf_url フィールドに
 * 任意メディア URL を載せる前提。
 */

export type KnowledgeMediaKind = "pdf" | "image" | "video" | "unknown";

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

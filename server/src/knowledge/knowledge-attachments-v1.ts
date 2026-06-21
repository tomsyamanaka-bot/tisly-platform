/** Knowledge Field UX V2 — 添付ファイルメタ（プレビュー準備） */

import { buildQnapDeepLinksV1 } from "./knowledge-qnap-links-v1.js";

export type KnowledgeAttachmentFileTypeV1 =
  | "pdf"
  | "photo"
  | "stl"
  | "step"
  | "gcode"
  | "other";

export interface KnowledgeAttachmentV1 {
  previewUrl?: string;
  fileType: KnowledgeAttachmentFileTypeV1;
  sourcePath: string;
  qnapPath?: string;
  openUrl?: string;
  label: string;
}

function inferFileType(path: string): KnowledgeAttachmentFileTypeV1 {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) return "photo";
  if (ext === "stl") return "stl";
  if (["step", "stp"].includes(ext)) return "step";
  if (["gcode", "nc"].includes(ext)) return "gcode";
  return "other";
}

export function buildAttachmentV1(input: {
  sourcePath: string;
  qnapPath?: string;
  openUrl?: string;
  label?: string;
  previewUrl?: string;
  fileType?: KnowledgeAttachmentFileTypeV1;
}): KnowledgeAttachmentV1 {
  const sourcePath = input.sourcePath.trim();
  const fileType = input.fileType ?? inferFileType(sourcePath);
  const qnapPath = input.qnapPath ?? (sourcePath.startsWith("AI/") ? sourcePath : undefined);
  return {
    previewUrl: input.previewUrl,
    fileType,
    sourcePath,
    qnapPath,
    openUrl: input.openUrl,
    label: input.label ?? sourcePath.split(/[/\\]/).pop() ?? sourcePath,
  };
}

export function buildQnapPathForAttachment(relativePath: string): string {
  return buildQnapDeepLinksV1(relativePath).relativePath;
}

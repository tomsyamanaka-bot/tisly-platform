/** Knowledge Field UX V3 — QNAP/ローカル実ファイル配信 adapter（将来 WebDAV 差し替え可能） */

import fs from "fs";
import path from "path";
import { getStorageSettingsV1 } from "../storage/storage-settings-store.js";
import { buildQnapDeepLinksV1 } from "./knowledge-qnap-links-v1.js";
import { getKnowledgeDataRoot } from "./knowledge-paths-v1.js";

export type KnowledgeFileDeliveryModeV1 =
  | "local"
  | "mock_mirror"
  | "external"
  | "placeholder";

export interface KnowledgeFileDeliveryV1 {
  previewUrl?: string;
  openUrl?: string;
  qnapPath: string;
  deliveryMode: KnowledgeFileDeliveryModeV1;
  fileExists: boolean;
  /** API 配信用の相対パス（認証付き GET /api/knowledge/files-v1?path=） */
  servePath?: string;
}

function normalizeRelativePath(relativePath: string): string {
  return String(relativePath ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\\/g, "/");
}

function mockMirrorRoot(): string {
  const settings = getStorageSettingsV1();
  const share = settings.qnap.shareName.replace(/^\/+|\/+$/g, "") || "TiSLY";
  return path.join(process.cwd(), "uploads", "qnap-storage-mock", share);
}

function mapToLocalKnowledgePath(relativePath: string): string | null {
  const rel = normalizeRelativePath(relativePath);
  if (!rel) return null;

  const root = getKnowledgeDataRoot();

  // AI/KnowledgeCards/foo.json → data/knowledge/KnowledgeCards/foo.json
  if (rel.startsWith("AI/")) {
    const sub = rel.slice("AI/".length);
    return path.join(root, sub);
  }

  // 3DPrint/Camera/foo.stl → data/knowledge/3DPrint/Camera/foo.stl
  if (rel.startsWith("3DPrint/")) {
    return path.join(root, rel);
  }

  // PLC/Templates/foo → data/knowledge/PLC/Templates/foo
  if (rel.startsWith("PLC/")) {
    return path.join(root, rel);
  }

  // Factory/... → data/knowledge/Factory/...
  if (rel.startsWith("Factory/")) {
    return path.join(root, rel);
  }

  // Photos/survey/... — knowledge attachments dir fallback
  if (rel.startsWith("Photos/")) {
    const att = path.join(root, "attachments", rel);
    if (fs.existsSync(att)) return att;
  }

  // Bare filename under knowledge root subfolders
  const direct = path.join(root, rel);
  if (fs.existsSync(direct)) return direct;

  return null;
}

function resolvePhysicalPath(relativePath: string): { absPath: string; mode: KnowledgeFileDeliveryModeV1 } | null {
  const rel = normalizeRelativePath(relativePath);
  if (!rel) return null;

  const localPath = mapToLocalKnowledgePath(rel);
  if (localPath && fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    return { absPath: localPath, mode: "local" };
  }

  const mockPath = path.join(mockMirrorRoot(), rel);
  if (fs.existsSync(mockPath) && fs.statSync(mockPath).isFile()) {
    return { absPath: mockPath, mode: "mock_mirror" };
  }

  return null;
}

function buildServeUrl(servePath: string): string {
  return `/api/knowledge/files-v1?path=${encodeURIComponent(servePath)}`;
}

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith("/api/") || url.startsWith("/document-viewer");
}

/** 添付ファイルの previewUrl / openUrl / qnapPath を解決（実ファイル未設定時は placeholder） */
export function resolveKnowledgeFileDeliveryV1(input: {
  sourcePath: string;
  qnapPath?: string;
  externalUrl?: string;
}): KnowledgeFileDeliveryV1 {
  const sourcePath = normalizeRelativePath(input.sourcePath);
  const qnapPath = normalizeRelativePath(input.qnapPath ?? sourcePath);
  const external = String(input.externalUrl ?? "").trim();

  if (external && isExternalUrl(external)) {
    const isImage = /\.(jpg|jpeg|png|gif|webp|heic)(\?|$)/i.test(external);
    const isPdf = /\.pdf(\?|$)/i.test(external) || external.includes("document-viewer");
    return {
      previewUrl: isImage || isPdf ? external : undefined,
      openUrl: external,
      qnapPath,
      deliveryMode: "external",
      fileExists: true,
    };
  }

  const physical = resolvePhysicalPath(qnapPath) ?? resolvePhysicalPath(sourcePath);
  if (physical) {
    const servePath = normalizeRelativePath(qnapPath || sourcePath);
    const url = buildServeUrl(servePath);
    const ext = path.extname(physical.absPath).toLowerCase();
    const previewable = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"].includes(ext);
    return {
      previewUrl: previewable ? url : undefined,
      openUrl: url,
      qnapPath,
      deliveryMode: physical.mode,
      fileExists: true,
      servePath,
    };
  }

  return {
    qnapPath,
    deliveryMode: "placeholder",
    fileExists: false,
  };
}

/** 認証付きファイル配信 — ローカルパスを解決して返す */
export function resolveKnowledgeFileForServeV1(relativePath: string): {
  absPath: string;
  contentType: string;
  fileName: string;
} | null {
  const rel = normalizeRelativePath(relativePath);
  if (!rel || rel.includes("..")) return null;

  const physical = resolvePhysicalPath(rel);
  if (!physical) return null;

  const ext = path.extname(physical.absPath).toLowerCase();
  const contentTypes: Record<string, string> = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".stl": "model/stl",
    ".step": "application/step",
    ".stp": "application/step",
    ".gcode": "text/plain",
    ".nc": "text/plain",
    ".json": "application/json",
  };

  return {
    absPath: physical.absPath,
    contentType: contentTypes[ext] ?? "application/octet-stream",
    fileName: path.basename(physical.absPath),
  };
}

export function enrichAttachmentWithDelivery<T extends { sourcePath: string; qnapPath?: string; openUrl?: string; previewUrl?: string }>(
  att: T
): T & { deliveryMode?: KnowledgeFileDeliveryModeV1; fileExists?: boolean } {
  const delivery = resolveKnowledgeFileDeliveryV1({
    sourcePath: att.sourcePath,
    qnapPath: att.qnapPath,
    externalUrl: att.openUrl ?? att.previewUrl,
  });
  return {
    ...att,
    previewUrl: delivery.previewUrl ?? att.previewUrl,
    openUrl: delivery.openUrl ?? att.openUrl,
    qnapPath: delivery.qnapPath,
    deliveryMode: delivery.deliveryMode,
    fileExists: delivery.fileExists,
  };
}

export { buildQnapDeepLinksV1 };

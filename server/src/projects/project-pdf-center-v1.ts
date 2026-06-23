/**
 * Phase16-4 — 案件 PDF センター（ワンタップ閲覧）
 */
import { getProjectDocumentsStatusV1 } from "./project-documents-v1.js";
import type { PracticalDocKind } from "./project-pdf-stale-v1.js";

export interface ProjectPdfCenterItemV1 {
  kind: PracticalDocKind;
  label: string;
  viewerKind: string;
  viewerUrl: string;
  hasPdf: boolean;
  statusLabel: string;
  statusIcon: string;
  fileName: string | null;
  updatedAt: string | null;
}

export interface ProjectPdfCenterV1 {
  projectId: string;
  items: ProjectPdfCenterItemV1[];
  readyCount: number;
  total: number;
}

const CENTER_KINDS: PracticalDocKind[] = ["estimate", "invoice", "specification", "completion"];

export function buildProjectPdfCenterV1(projectId: string): ProjectPdfCenterV1 {
  const docs = getProjectDocumentsStatusV1(projectId);
  const byKind = new Map((docs?.documents ?? []).map((d) => [d.kind, d]));

  const items: ProjectPdfCenterItemV1[] = CENTER_KINDS.map((kind) => {
    const doc = byKind.get(kind);
    const viewerKind = doc?.viewerKind ?? kind;
    const viewerUrl = `/document-viewer-v1.html?projectId=${encodeURIComponent(projectId)}&kind=${encodeURIComponent(viewerKind)}`;
    return {
      kind,
      label: doc?.label ?? kind,
      viewerKind,
      viewerUrl,
      hasPdf: Boolean(doc?.hasPdf),
      statusLabel: doc?.statusLabel ?? "未作成",
      statusIcon: doc?.statusIcon ?? "⬜",
      fileName: doc?.fileName ?? null,
      updatedAt: doc?.updatedAt ?? null,
    };
  });

  const readyCount = items.filter((i) => i.hasPdf).length;
  return { projectId, items, readyCount, total: items.length };
}

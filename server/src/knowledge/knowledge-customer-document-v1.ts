/** Knowledge Customer UI V4 — ref + fileId 安全 PDF 閲覧 */

import {
  getCustomerProjectFilePlaceholderV1,
  listCustomerProjectFilesV1,
  resolveCustomerProjectFileInternalV1,
  type KnowledgeCustomerProjectFileV1,
} from "./knowledge-customer-project-files-v1.js";
import {
  normalizeCustomerProjectRefV1,
  resolveCustomerProjectMetaV1,
} from "./knowledge-customer-project-adapter-v1.js";
import {
  filterCustomerProjectFilesForShareV1,
  isCustomerShareVisibleFileV1,
} from "./knowledge-customer-share-filter-v1.js";

const FILE_ID_ALIASES: Record<string, string> = {
  "spec-pdf-001": "spec-pdf",
  "completion-pdf-001": "completion-pdf",
  "estimate-pdf-001": "estimate-pdf",
  "invoice-pdf-001": "invoice-pdf",
  "manual-pdf-001": "manual-camera",
};

export interface KnowledgeCustomerDocumentPageV1 {
  ref: string;
  fileId: string;
  title: string;
  safeLabel: string;
  fileType: string;
  category: string;
  viewUrl: string;
  hasContent: boolean;
  preparingMessage?: string;
  propertyName: string;
  customerSafeTitle: string;
  projectPageUrl: string;
  closeUrl: string;
  isShareView: boolean;
}

function normalizeFileId(fileId: string): string {
  const trimmed = fileId.trim();
  return FILE_ID_ALIASES[trimmed] ?? trimmed;
}

function findProjectFile(
  ref: string,
  fileId: string,
  shareView: boolean
): KnowledgeCustomerProjectFileV1 | null {
  const normalizedId = normalizeFileId(fileId);
  let files = listCustomerProjectFilesV1(ref);
  if (shareView) {
    files = filterCustomerProjectFilesForShareV1(files);
  }

  const direct = files.find((f) => f.fileId === normalizedId || f.fileId === fileId);
  if (direct) return direct;

  if (shareView) {
    const hidden = listCustomerProjectFilesV1(ref).find(
      (f) => f.fileId === normalizedId || f.fileId === fileId
    );
    if (
      hidden &&
      !isCustomerShareVisibleFileV1({
        fileType: hidden.type,
        category: hidden.category,
        safeLabel: hidden.safeLabel,
        fileId: hidden.fileId,
      })
    ) {
      return null;
    }
  }

  return null;
}

function buildDocumentViewUrl(ref: string, fileId: string, shareView: boolean): string {
  const qs = new URLSearchParams({
    ref,
    fileId: normalizeFileId(fileId),
  });
  if (shareView) qs.set("view", "share");
  return `/knowledge-customer-document-v1?${qs.toString()}`;
}

function buildFileStreamUrl(ref: string, fileId: string): string {
  return `/api/knowledge/customer-project-file-v1?ref=${encodeURIComponent(ref)}&fileId=${encodeURIComponent(normalizeFileId(fileId))}`;
}

export function resolveCustomerDocumentPageV1(input: {
  ref: string;
  fileId: string;
  shareView?: boolean;
}): KnowledgeCustomerDocumentPageV1 {
  const ref = normalizeCustomerProjectRefV1(input.ref);
  const fileId = normalizeFileId(input.fileId);
  const shareView = Boolean(input.shareView);
  const meta = resolveCustomerProjectMetaV1(ref);
  const file = findProjectFile(ref, fileId, shareView);

  const projectQs = shareView ? `ref=${encodeURIComponent(ref)}&view=share` : `ref=${encodeURIComponent(ref)}`;
  const projectPageUrl = `/knowledge-customer-project-v1?${projectQs}`;

  if (!file) {
    return {
      ref,
      fileId,
      title: "資料",
      safeLabel: "資料",
      fileType: "unknown",
      category: "書類",
      viewUrl: "",
      hasContent: false,
      preparingMessage: "資料を準備中です。順次追加しております。",
      propertyName: meta.displayName,
      customerSafeTitle: meta.customerSafeTitle,
      projectPageUrl,
      closeUrl: projectPageUrl,
      isShareView: shareView,
    };
  }

  const resolved = resolveCustomerProjectFileInternalV1(ref, file.fileId);
  const placeholder = getCustomerProjectFilePlaceholderV1(file.fileId);
  const hasContent = Boolean(resolved || placeholder.buffer.length > 0);

  return {
    ref,
    fileId: file.fileId,
    title: file.title,
    safeLabel: file.safeLabel,
    fileType: file.type,
    category: file.category,
    viewUrl: hasContent ? buildFileStreamUrl(ref, file.fileId) : "",
    hasContent,
    preparingMessage: hasContent ? undefined : "資料を準備中です。順次追加しております。",
    propertyName: meta.displayName,
    customerSafeTitle: meta.customerSafeTitle,
    projectPageUrl,
    closeUrl: projectPageUrl,
    isShareView: shareView,
  };
}

export function buildCustomerDocumentLinkV1(
  ref: string,
  fileId: string,
  shareView = false
): string {
  return buildDocumentViewUrl(ref, fileId, shareView);
}

export function normalizeCustomerDocumentFileIdV1(fileId: string): string {
  return normalizeFileId(fileId);
}

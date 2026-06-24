/** Knowledge Customer UI V4 — お客様共有URL用 安全フィルタ */

import {
  isCorruptQuestionMarkText,
  sanitizePdfRequiredField,
} from "../business/pdf/pdf-text-sanitize.js";
import type { KnowledgeCustomerMaterialItemV1 } from "./knowledge-customer-project-v1.js";
import type {
  KnowledgeCustomerPdfSectionItemV1,
  KnowledgeCustomerPdfSectionsV1,
} from "./knowledge-customer-project-v1.js";
import type { KnowledgeCustomerProjectFileV1 } from "./knowledge-customer-project-files-v1.js";

export interface CustomerShareFilterInputV1 {
  isCustomerVisible?: boolean;
  fileType?: string;
  category?: string;
  safeLabel?: string;
  ref?: string;
  fileId?: string;
}

const INTERNAL_LABEL_RE =
  /請求|内部|作業メモ|社内|QNAP|SMB|WebDAV|project-storage|debug|管理者|原価|倍率/i;

const HIDDEN_FILE_TYPES = new Set([
  "invoice_pdf",
  "internal_memo",
  "work_memo",
  "admin_pdf",
]);

export function isCustomerShareVisibleFileV1(input: CustomerShareFilterInputV1): boolean {
  if (input.isCustomerVisible === false) return false;

  const fileType = String(input.fileType ?? "");
  if (HIDDEN_FILE_TYPES.has(fileType)) return false;
  if (fileType === "invoice_pdf") return false;

  const label = `${input.safeLabel ?? ""} ${input.category ?? ""}`;
  if (INTERNAL_LABEL_RE.test(label)) {
    if (/請求/.test(label)) return false;
    if (/内部|作業メモ|管理者|debug/.test(label)) return false;
  }

  return true;
}

export function filterCustomerProjectFilesForShareV1(
  files: KnowledgeCustomerProjectFileV1[]
): KnowledgeCustomerProjectFileV1[] {
  return files.filter((f) =>
    isCustomerShareVisibleFileV1({
      isCustomerVisible: true,
      fileType: f.type,
      category: f.category,
      safeLabel: f.safeLabel,
      fileId: f.fileId,
    })
  );
}

export function filterCustomerPdfSectionsForShareV1(
  sections: KnowledgeCustomerPdfSectionsV1
): KnowledgeCustomerPdfSectionsV1 {
  const filterItems = (items: KnowledgeCustomerPdfSectionItemV1[]) =>
    items.filter((item) =>
      isCustomerShareVisibleFileV1({
        isCustomerVisible: true,
        fileType: inferPdfTypeFromFileId(item.fileId),
        safeLabel: item.safeLabel,
        fileId: item.fileId,
      })
    );

  return {
    specification: filterItems(sections.specification),
    completion: filterItems(sections.completion),
    estimate: filterItems(sections.estimate),
    invoice: [],
    manual: filterItems(sections.manual),
    parts: filterItems(sections.parts),
  };
}

function inferPdfTypeFromFileId(fileId: string): string {
  if (/invoice|請求/.test(fileId)) return "invoice_pdf";
  if (/estimate|見積/.test(fileId)) return "estimate_pdf";
  if (/completion|完了/.test(fileId)) return "completion_pdf";
  if (/spec|仕様/.test(fileId)) return "specification_pdf";
  return "manual_pdf";
}

export function filterCustomerMaterialsForShareV1(
  materials: KnowledgeCustomerMaterialItemV1[]
): KnowledgeCustomerMaterialItemV1[] {
  return materials.filter((m) => {
    if (m.type === "pdf" && /請求|invoice/i.test(`${m.title} ${m.tags.join(" ")}`)) {
      return false;
    }
    if (/内部|作業メモ|管理者|QNAP|debug/i.test(`${m.title} ${m.description ?? ""}`)) {
      return false;
    }
    return true;
  });
}

export function sanitizeSharePayloadTextV1(text: string, fallback = ""): string {
  let result = String(text ?? "")
    .replace(/https?:\/\/[^\s]+/gi, "")
    .replace(/\\\\[^\s]+/gi, "")
    .replace(/\/api\/[^\s]+/gi, "")
    .replace(/project-storage[^\s]*/gi, "")
    .replace(/QNAP[^\s]*/gi, "")
    .replace(/WebDAV[^\s]*/gi, "")
    .replace(/SMB[^\s]*/gi, "")
    .replace(/\?{3,}/g, "")
    .trim();
  if (!result || isCorruptQuestionMarkText(result)) {
    return fallback;
  }
  return sanitizePdfRequiredField(result, fallback || "—");
}

export function assertSharePayloadSanitizedV1(payload: unknown): boolean {
  const text = JSON.stringify(payload);
  const forbidden =
    /QNAP|SMB|WebDAV|192\.168\.|projectId|userId|mock fallback|project-storage|filemanager|\\\\|\/api\//i;
  return !forbidden.test(text);
}

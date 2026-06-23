/**
 * お客様ポータル用ファイルフィルタ — 見積・請求は表示、社内情報は非表示
 */

import type { KnowledgeCustomerProjectFileV1 } from "../../knowledge/knowledge-customer-project-files-v1.js";
import { sanitizeSharePayloadTextV1 } from "../../knowledge/knowledge-customer-share-filter-v1.js";

const INTERNAL_LABEL_RE =
  /内部|作業メモ|社内|QNAP|SMB|WebDAV|project-storage|debug|管理者|原価|倍率|粗利|発注|材料管理/i;

const HIDDEN_FILE_TYPES = new Set(["internal_memo", "work_memo", "admin_pdf"]);

export function filterCustomerPortalProjectFilesV1(
  files: KnowledgeCustomerProjectFileV1[]
): KnowledgeCustomerProjectFileV1[] {
  return files.filter((f) => {
    if (HIDDEN_FILE_TYPES.has(f.type)) return false;
    const label = `${f.safeLabel ?? ""} ${f.title ?? ""} ${f.category ?? ""}`;
    if (INTERNAL_LABEL_RE.test(label)) return false;
    return true;
  });
}

export function customerPortalDocLabelV1(
  type: string,
  fallback: string
): string {
  const map: Record<string, string> = {
    specification_pdf: "仕様書",
    completion_pdf: "完了報告書",
    estimate_pdf: "見積書",
    invoice_pdf: "請求書",
    manual_pdf: "取扱説明書",
  };
  return sanitizeSharePayloadTextV1(map[type] ?? fallback);
}

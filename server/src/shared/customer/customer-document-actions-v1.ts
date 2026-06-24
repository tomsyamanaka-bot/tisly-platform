/**
 * お客様 PDF 閲覧・資料ページのボタン定義 — DOM 非依存
 */

import { resolveCustomerDocumentBackUrlV1 } from "../navigation/customer-document-nav-v1.js";

export const CUSTOMER_DOCUMENT_BOTTOM_ACTIONS_V1 = [
  { id: "back", label: "戻る", variant: "secondary" as const },
  { id: "pdf", label: "PDFを見る", variant: "primary" as const },
  { id: "save", label: "保存", variant: "secondary" as const },
] as const;

/** 資料ページ下部バー（戻る · PDF · 保存 · 連絡） */
export const CUSTOMER_PROJECT_BOTTOM_ACTIONS_V1 = [
  { id: "back", label: "戻る", variant: "secondary" as const },
  { id: "pdf", label: "PDFを見る", variant: "primary" as const },
  { id: "save", label: "保存", variant: "secondary" as const },
  { id: "contact", label: "TOMSへ連絡", variant: "contact" as const },
] as const;

export type CustomerDocumentBottomActionIdV1 =
  (typeof CUSTOMER_DOCUMENT_BOTTOM_ACTIONS_V1)[number]["id"];

export type CustomerProjectBottomActionIdV1 =
  (typeof CUSTOMER_PROJECT_BOTTOM_ACTIONS_V1)[number]["id"];

export function resolveCustomerDocumentBackHrefV1(shareId: string): string {
  return resolveCustomerDocumentBackUrlV1(shareId);
}

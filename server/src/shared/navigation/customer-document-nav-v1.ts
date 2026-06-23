/**
 * お客様 PDF 閲覧画面の戻る先 — 必ず /customer/project/:shareId
 */

import { buildCustomerProjectUrlV1 } from "../routes/tisly-routes-v1.js";

export function resolveCustomerDocumentBackUrlV1(shareId: string): string {
  return buildCustomerProjectUrlV1(shareId);
}

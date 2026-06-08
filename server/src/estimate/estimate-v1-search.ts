/** 見積・請求の将来検索用メタデータ */

import type { BusinessProject, Estimate, Invoice } from "../business/business-types.js";
import type { TomsEstimateHeader } from "../business/toms-document-format.js";

export interface PracticalSearchIndex {
  estimateNo: string;
  invoiceNo: string | null;
  addressee: string;
  clientName: string;
  siteName: string;
  workLocation: string;
  contactName: string;
  phone: string;
  email: string;
  subject: string;
  createdAt: string;
  updatedAt: string;
  total: number;
}

export function buildPracticalSearchIndex(
  project: BusinessProject,
  estimate: Estimate,
  header: TomsEstimateHeader | null | undefined,
  invoice?: Invoice | null,
  ctx?: {
    siteName?: string | null;
    contactName?: string | null;
  }
): PracticalSearchIndex {
  return {
    estimateNo: header?.estimateNo ?? estimate.estimateNo ?? "",
    invoiceNo: invoice?.invoiceNo ?? null,
    addressee: header?.addressee ?? estimate.customerName ?? "",
    clientName: project.customerName ?? "",
    siteName: ctx?.siteName ?? header?.siteName ?? project.title ?? "",
    workLocation: header?.workLocation ?? project.address ?? "",
    contactName: ctx?.contactName ?? header?.staffName ?? "",
    phone: header?.phone ?? project.phone ?? "",
    email: header?.email ?? "",
    subject: header?.subject ?? estimate.title ?? "",
    createdAt: estimate.createdAt,
    updatedAt: estimate.updatedAt,
    total: estimate.total,
  };
}

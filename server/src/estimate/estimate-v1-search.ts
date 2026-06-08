/** 見積・請求の将来検索用メタデータ */

import type { BusinessProject, Estimate, Invoice } from "../business/business-types.js";
import type { TomsEstimateHeader } from "../business/toms-document-format.js";

export interface PracticalSearchIndex {
  addressee: string;
  clientName: string;
  workLocation: string;
  estimateNo: string;
  invoiceNo: string | null;
  phone: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export function buildPracticalSearchIndex(
  project: BusinessProject,
  estimate: Estimate,
  header: TomsEstimateHeader | null | undefined,
  invoice?: Invoice | null
): PracticalSearchIndex {
  return {
    addressee: header?.addressee ?? estimate.customerName ?? "",
    clientName: project.customerName ?? "",
    workLocation: header?.workLocation ?? project.address ?? "",
    estimateNo: header?.estimateNo ?? estimate.estimateNo ?? "",
    invoiceNo: invoice?.invoiceNo ?? null,
    phone: header?.phone ?? project.phone ?? "",
    email: header?.email ?? "",
    createdAt: estimate.createdAt,
    updatedAt: estimate.updatedAt,
  };
}

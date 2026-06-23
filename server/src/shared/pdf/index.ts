/** PDF データ構造 — HTML テンプレート非依存の型 re-export */
export type { TomsV2LineItem, TomsV2TotalsInput, TomsV2DocKind } from "../../business/pdf/toms-excel-doc-layout-v2.js";
export { getTomsCompanyInfo } from "../../business/pdf/company.js";

export interface PdfDocumentMetaV1 {
  kind: "estimate" | "invoice" | "specification" | "completion";
  issueDate?: string;
  docNo?: string;
  addressee?: string;
  subject?: string;
  total?: number;
}

export interface PdfGenerationPayloadV1 {
  meta: PdfDocumentMetaV1;
  lines?: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  notes?: string;
  bankInfo?: string;
  includePhotos?: boolean;
}

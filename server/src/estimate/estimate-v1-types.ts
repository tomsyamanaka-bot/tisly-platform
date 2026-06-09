/** TiSLY 見積PWA v1 — 型・定数 */

import type {
  CustomerPriceRuleSummary,
  Estimate,
  EstimateLineItem,
  Invoice,
} from "../business/business-types.js";
import type { TomsEstimateDocumentV1, TomsEstimateHeader } from "../business/toms-document-format.js";
import type { SurveyWorkflowStatus } from "../survey/survey-v1-types.js";

export interface EstimatePendingSurveyV1 {
  surveyProjectId: string;
  projectNo: string | null;
  customerCode: string;
  customerName: string;
  address: string | null;
  surveyDate: string | null;
  materialCount: number;
  photoCount: number;
  handoffAt: string | null;
  businessProjectId: string | null;
  hasEstimate: boolean;
}

export interface EstimateProjectV1Summary {
  businessProjectId: string;
  projectNo: string;
  customerName: string;
  title: string;
  surveyProjectId: string | null;
  estimateId: string | null;
  estimateNo: string | null;
  subtotal: number | null;
  total: number | null;
  pdfPath: string | null;
  surveyWorkflowStatus: SurveyWorkflowStatus | null;
  updatedAt: string;
}

export interface EstimateProjectV1Detail {
  businessProjectId: string;
  projectNo: string;
  customerName: string;
  customerId?: string | null;
  priceRule?: CustomerPriceRuleSummary | null;
  title: string;
  address: string;
  phone: string;
  siteName?: string | null;
  customerAddress?: string | null;
  contactName?: string | null;
  email?: string | null;
  estimateNotes?: string | null;
  header?: TomsEstimateHeader | null;
  surveyProjectId: string | null;
  surveyWorkflowStatus: SurveyWorkflowStatus | null;
  estimate: Estimate | null;
  invoice: Invoice | null;
  pdfPath: string | null;
  tomsFormatReady: boolean;
}

export interface EstimateTotalsV1 {
  lineSubtotal: number;
  shuseiDiscount: number;
  subtotal: number;
  tax: number;
  total: number;
  internalCost: number;
  grossProfit: number;
  grossProfitRate: number;
}

/** @deprecated use TomsEstimateDocumentV1 */
export type TomsEstimateFormatV1 = TomsEstimateDocumentV1;

export type EstimateLineInputV1 = Partial<EstimateLineItem>;

export type EstimateHeaderInputV1 = Partial<TomsEstimateHeader>;

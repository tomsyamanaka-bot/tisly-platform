/** TiSLY 見積PWA v1 — 型・定数 */

import type { Estimate, EstimateLineItem } from "../business/business-types.js";
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
  title: string;
  address: string;
  phone: string;
  siteName?: string | null;
  customerAddress?: string | null;
  contactName?: string | null;
  email?: string | null;
  estimateNotes?: string | null;
  surveyProjectId: string | null;
  surveyWorkflowStatus: SurveyWorkflowStatus | null;
  estimate: Estimate | null;
  pdfPath: string | null;
  tomsFormatReady: boolean;
}

export interface EstimateTotalsV1 {
  subtotal: number;
  tax: number;
  total: number;
  internalCost: number;
  grossProfit: number;
  grossProfitRate: number;
}

/** TOMS 標準フォーマット連携準備用（スタブ） */
export interface TomsEstimateLineV1 {
  lineNo: number;
  category: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  memo?: string;
}

export interface TomsEstimateFormatV1 {
  version: "toms-standard-v1-stub";
  projectNo: string;
  customerName: string;
  customerAddress?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  title: string;
  notes?: string;
  lines: TomsEstimateLineV1[];
  subtotal: number;
  tax: number;
  total: number;
  generatedAt: string;
  note: string;
}

export type EstimateLineInputV1 = Partial<EstimateLineItem>;

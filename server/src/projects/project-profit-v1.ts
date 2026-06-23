/**
 * Phase16-3 — 案件利益計算（仮計算可）
 */
import { getEstimate, getInvoice } from "../business/business-store.js";

export interface ProjectProfitSummaryV1 {
  estimateAmount: number | null;
  invoiceAmount: number | null;
  materialCost: number | null;
  grossProfit: number | null;
  grossProfitRate: number | null;
  /** 請求未作成時は見積ベースの仮粗利 */
  isProvisional: boolean;
  currency: "JPY";
}

export function buildProjectProfitSummaryV1(input: {
  estimateId: string | null;
  invoiceId: string | null;
}): ProjectProfitSummaryV1 {
  const estimate = input.estimateId ? getEstimate(input.estimateId) : null;
  const invoice = input.invoiceId ? getInvoice(input.invoiceId) : null;

  const estimateAmount = estimate?.total ?? null;
  const invoiceAmount = invoice?.total ?? null;
  const materialCost = estimate?.internalCost ?? null;

  const revenue = invoiceAmount ?? estimateAmount;
  const grossProfit =
    estimate != null
      ? estimate.grossProfit
      : revenue != null && materialCost != null
        ? revenue - materialCost
        : null;
  const grossProfitRate =
    estimate != null
      ? estimate.grossProfitRate
      : revenue != null && revenue > 0 && grossProfit != null
        ? Math.round((grossProfit / revenue) * 1000) / 10
        : null;

  return {
    estimateAmount,
    invoiceAmount,
    materialCost,
    grossProfit,
    grossProfitRate,
    isProvisional: !invoiceAmount && estimateAmount != null,
    currency: "JPY",
  };
}

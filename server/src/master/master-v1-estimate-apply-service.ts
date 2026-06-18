import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type { EstimateLineItem } from "../business/business-types.js";
import {
  createBusinessProject,
  createEstimate,
  getBusinessProject,
  updateBusinessProject,
  updateEstimateHeader,
} from "../business/business-store.js";
import { ensureBusinessCustomer } from "../business/customer-price-rules.js";
import { normalizeLineItems } from "../business/estimate-math.js";
import {
  getEstimateProjectV1Detail,
  updateEstimateItemsV1,
} from "../estimate/estimate-v1-store.js";
import type { EstimateProjectV1Detail } from "../estimate/estimate-v1-types.js";
import { getSurveyProjectV1Detail } from "../survey/survey-v1-store.js";
import { getSurveyDrawingSketchV1 } from "../survey/survey-drawing-v1-store.js";
import {
  getMasterV1EstimateDraft,
  markMasterV1EstimateDraftApplied,
  type MasterV1EstimateDraft,
} from "./master-v1-draft-estimate-store.js";
import { getMasterV1Customer } from "./master-v1-store.js";
import type {
  MasterV1EstimatePreviewEnriched,
  MasterV1EstimatePreviewLine,
  MasterV1PriceSource,
} from "./master-v1-types.js";
import { masterPriceSourceLabel } from "./master-v1-pricing.js";

function priceSourceLabel(source: MasterV1PriceSource): string {
  return masterPriceSourceLabel(source);
}

export function buildEstimateItemsFromMasterPreview(
  preview: MasterV1EstimatePreviewEnriched
): EstimateLineItem[] {
  const lines = [...(preview.workLines || []), ...(preview.materialLines || [])];
  return normalizeLineItems(lines.map(convertPreviewLineToEstimateItem));
}

function convertPreviewLineToEstimateItem(line: MasterV1EstimatePreviewLine): EstimateLineItem {
  const memoParts = [
    line.memo,
    `[マスター] ${priceSourceLabel(line.priceSource)}`,
    line.priceSource === "customer_override" && line.customerUnitSell != null
      ? `顧客単価 ¥${line.customerUnitSell}`
      : null,
    line.priceSource === "rank_multiplier" ? `ランク売価 ¥${line.rankUnitSell}` : null,
    `標準 ¥${line.standardUnitSell}`,
    `原価 ¥${line.unitCost}/${line.unit}`,
    `粗利 ${line.grossProfitRate}%`,
  ].filter(Boolean);

  return {
    id: uuid(),
    category: line.itemType === "work" ? "labor" : "material",
    name: line.label,
    unit: line.unit,
    quantity: line.qty,
    unitPrice: line.appliedUnitSell,
    amount: line.totalSell,
    costPrice: line.unitCost,
    priceSource: line.priceSource,
    memo: memoParts.join(" / "),
    fromAiCandidate: true,
    orderTarget: line.itemType === "material",
  };
}

function findBusinessProjectBySurveyId(surveyProjectId: string): string | null {
  const row = getDatabase()
    .prepare(`SELECT id FROM business_projects WHERE survey_project_id = ? LIMIT 1`)
    .get(surveyProjectId) as { id: string } | undefined;
  return row?.id ?? null;
}

function ensureBusinessProjectForMasterDraft(draft: MasterV1EstimateDraft): string {
  if (draft.businessProjectId) {
    const existing = getBusinessProject(draft.businessProjectId);
    if (existing) return existing.id;
  }

  if (draft.sketchId) {
    const sketch = getSurveyDrawingSketchV1(draft.sketchId);
    if (sketch?.businessProjectId) {
      const p = getBusinessProject(sketch.businessProjectId);
      if (p) return p.id;
    }
    if (sketch?.projectId) {
      const fromSurvey = ensureBusinessProjectFromSurvey(sketch.projectId, draft);
      return fromSurvey;
    }
  }

  if (draft.projectId) {
    return ensureBusinessProjectFromSurvey(draft.projectId, draft);
  }

  return ensureStandaloneBusinessProject(draft);
}

function ensureBusinessProjectFromSurvey(
  surveyProjectId: string,
  draft: MasterV1EstimateDraft
): string {
  const existingId = findBusinessProjectBySurveyId(surveyProjectId);
  if (existingId) return existingId;

  const detail = getSurveyProjectV1Detail(surveyProjectId);
  if (!detail) throw new Error("survey project not found");

  const customerId = `BCU-SVY-${detail.customerCode}`;
  ensureBusinessCustomer({
    id: customerId,
    name: detail.customerName,
    type: "company",
  });

  const project = createBusinessProject({
    customerId,
    customerName: detail.customerName,
    title: detail.siteName || detail.customerName,
    address: detail.address ?? "",
    phone: detail.phone ?? "",
    surveyProjectId,
  });

  const memoParts = [
    `見積マスター候補連携 (${draft.id.slice(0, 8)})`,
    draft.sketchId ? `sketch:${draft.sketchId.slice(0, 8)}` : "",
    detail.notes ? `メモ: ${detail.notes}` : "",
  ].filter(Boolean);

  updateBusinessProject(project.id, {
    surveyMemo: memoParts.join(" / "),
  });

  return project.id;
}

function ensureStandaloneBusinessProject(draft: MasterV1EstimateDraft): string {
  const masterCustomer = draft.customerId ? getMasterV1Customer(draft.customerId) : null;
  const customerName = masterCustomer?.name ?? "見積マスター連携";
  const customerId = masterCustomer
    ? `BCU-MST-${masterCustomer.customerCode || masterCustomer.id.slice(0, 8)}`
    : `BCU-MST-${uuid().slice(0, 8)}`;

  ensureBusinessCustomer({
    id: customerId,
    name: customerName,
    type: "company",
  });

  const title =
    draft.preview.workLines?.[0]?.label ||
    draft.preview.materialLines?.[0]?.label ||
    "見積マスター連携案件";

  const project = createBusinessProject({
    customerId,
    customerName,
    title,
    address: masterCustomer?.address ?? "",
    phone: masterCustomer?.phone ?? "",
  });

  updateBusinessProject(project.id, {
    surveyMemo: `見積マスター候補連携 (${draft.id.slice(0, 8)})`,
  });

  return project.id;
}

function buildHeaderFromDraft(
  draft: MasterV1EstimateDraft,
  businessProjectId: string
): {
  addressee: string;
  subject: string;
  workLocation: string;
  address: string;
  phone: string;
  email: string;
  notes: string;
} {
  const project = getBusinessProject(businessProjectId)!;
  const masterCustomer = draft.customerId ? getMasterV1Customer(draft.customerId) : null;
  const surveyProjectId =
    draft.projectId ||
    (draft.sketchId ? getSurveyDrawingSketchV1(draft.sketchId)?.projectId : null);
  const survey = surveyProjectId ? getSurveyProjectV1Detail(surveyProjectId) : null;

  const addressee = masterCustomer?.name ?? survey?.customerName ?? project.customerName;
  const subject = survey?.siteName || project.title;
  const workLocation = survey?.siteName || survey?.address || project.address;
  const noteParts = [
    "見積マスター候補から作成",
    draft.sketchId ? `図面ID: ${draft.sketchId.slice(0, 8)}` : "",
    `原価 ¥${draft.preview.totalCost.toLocaleString("ja-JP")}`,
    `売価 ¥${draft.preview.totalSell.toLocaleString("ja-JP")}`,
    `粗利 ${draft.preview.grossProfitRate}%`,
  ].filter(Boolean);

  return {
    addressee,
    subject,
    workLocation,
    address: survey?.address ?? project.address,
    phone: survey?.phone ?? masterCustomer?.phone ?? project.phone,
    email: survey?.email ?? masterCustomer?.email ?? "",
    notes: noteParts.join(" / "),
  };
}

function persistEstimateMasterDraftLink(estimateId: string, masterDraftId: string): void {
  getDatabase()
    .prepare(`UPDATE business_estimates SET master_draft_id = ?, updated_at = ? WHERE id = ?`)
    .run(masterDraftId, new Date().toISOString(), estimateId);
}

export function createEstimateFromMasterDraftV1(
  masterDraftId: string,
  createdBy?: string
): EstimateProjectV1Detail {
  const draft = getMasterV1EstimateDraft(masterDraftId);
  if (!draft) throw new Error("master draft not found");

  const businessProjectId = ensureBusinessProjectForMasterDraft(draft);
  const items = buildEstimateItemsFromMasterPreview(draft.preview);
  if (!items.length) throw new Error("master draft has no line items");

  let project = getBusinessProject(businessProjectId)!;
  const header = buildHeaderFromDraft(draft, businessProjectId);

  if (!project.estimateId) {
    createEstimate(project.id, items, {
      shuseiDiscountMemo: createdBy ? `作成: ${createdBy}` : "",
    });
    project = getBusinessProject(businessProjectId)!;
    if (!project.estimateId) throw new Error("estimate create failed");
    updateEstimateHeader(project.estimateId, header);
    persistEstimateMasterDraftLink(project.estimateId, masterDraftId);
  } else {
    updateEstimateItemsV1(businessProjectId, items, {
      notes: header.notes,
      forceOverwriteManualLines: true,
    });
    updateEstimateHeader(project.estimateId, header);
    persistEstimateMasterDraftLink(project.estimateId, masterDraftId);
  }

  markMasterV1EstimateDraftApplied(masterDraftId, businessProjectId, project.estimateId!);

  const detail = getEstimateProjectV1Detail(businessProjectId)!;
  return {
    ...detail,
    masterDraftId,
    pricingSummary: summarizeMasterPreviewPricing(draft.preview),
  } as EstimateProjectV1Detail & {
    masterDraftId: string;
    pricingSummary: ReturnType<typeof summarizeMasterPreviewPricing>;
  };
}

export function summarizeMasterPreviewPricing(preview: MasterV1EstimatePreviewEnriched) {
  const lines = [...(preview.workLines || []), ...(preview.materialLines || [])];
  const customerOverrideCount = lines.filter((l) => l.priceSource === "customer_override").length;
  const rankCount = lines.filter((l) => l.priceSource === "rank_multiplier").length;
  const standardCount = lines.filter((l) => l.priceSource === "standard").length;
  const costDoubleCount = lines.filter((l) => l.priceSource === "cost_double").length;
  const missingCostLines = lines.filter((l) => !l.unitCost || l.unitCost <= 0 || l.priceSource === "missing");
  return {
    totalCost: preview.totalCost,
    totalSell: preview.totalSell,
    grossProfit: preview.grossProfit,
    grossProfitRate: preview.grossProfitRate,
    customerOverrideCount,
    rankCount,
    standardCount,
    costDoubleCount,
    missingCostCount: missingCostLines.length,
    missingCostLabels: missingCostLines.map((l) => l.label),
  };
}

function loadMasterDraftIdForProject(businessProjectId: string): string | null {
  const project = getBusinessProject(businessProjectId);
  if (!project?.estimateId) return null;
  const row = getDatabase()
    .prepare(`SELECT master_draft_id FROM business_estimates WHERE id = ?`)
    .get(project.estimateId) as { master_draft_id: string | null } | undefined;
  return row?.master_draft_id ?? null;
}

/** マスター候補の最新単価で見積明細を再計算 */
export function recalculateEstimateFromMasterDraftV1(
  businessProjectId: string
): EstimateProjectV1Detail {
  const masterDraftId = loadMasterDraftIdForProject(businessProjectId);
  if (!masterDraftId) throw new Error("master draft not linked");

  const draft = getMasterV1EstimateDraft(masterDraftId);
  if (!draft) throw new Error("master draft not found");

  const project = getBusinessProject(businessProjectId);
  if (!project?.estimateId) throw new Error("estimate not found");

  const items = buildEstimateItemsFromMasterPreview(draft.preview);
  if (!items.length) throw new Error("master draft has no line items");

  const header = buildHeaderFromDraft(draft, businessProjectId);
  updateEstimateItemsV1(businessProjectId, items, {
    notes: header.notes,
    forceOverwriteManualLines: true,
  });
  updateEstimateHeader(project.estimateId, header);

  const detail = getEstimateProjectV1Detail(businessProjectId)!;
  return {
    ...detail,
    masterDraftId,
    pricingSummary: summarizeMasterPreviewPricing(draft.preview),
  } as EstimateProjectV1Detail & {
    masterDraftId: string;
    pricingSummary: ReturnType<typeof summarizeMasterPreviewPricing>;
  };
}

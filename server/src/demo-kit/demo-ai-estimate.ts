import {
  createAiEstimatePlaceholder,
  listSurveyPhotos,
} from "../survey/survey-store.js";
import {
  createEstimate,
  getBusinessProject,
  updateBusinessProject,
} from "../business/business-store.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { getDatabase } from "../db/database.js";
import { DEMO_KPI_PREFIX } from "./demo-kpi-seed.js";
import type { EstimateLineItem } from "../business/business-types.js";
import { v4 as uuid } from "uuid";

const SKIP = { skipTransitionCheck: true } as const;

export interface DemoAiEstimateStep {
  step: string;
  status: "done" | "pending";
  detail?: string;
}

export function getDemoSurveyProjectId(customerCode: string): string | null {
  const row = getDatabase()
    .prepare(`SELECT project_id FROM survey_projects WHERE customer_code = ? ORDER BY created_at LIMIT 1`)
    .get(customerCode.toUpperCase()) as { project_id: string } | undefined;
  return row?.project_id ?? null;
}

export function runDemoAiEstimateFlow(customerCode = "TOMS001"): {
  customerCode: string;
  surveyProjectId: string;
  photoIds: string[];
  aiCandidate: Record<string, unknown>;
  businessProjectId: string;
  estimateId: string | null;
  steps: DemoAiEstimateStep[];
} {
  const code = customerCode.toUpperCase();
  const customer = getCustomerByCode(code);
  if (!customer) throw new Error(`Customer not found: ${code}`);

  const surveyProjectId = getDemoSurveyProjectId(code);
  if (!surveyProjectId) throw new Error("Survey project not found — run demo reset first");

  const photos = listSurveyPhotos(surveyProjectId);
  const photoIds = photos.slice(0, 3).map((p) => p.id);
  if (photoIds.length === 0) throw new Error("No survey photos — run demo reset first");

  const ai = createAiEstimatePlaceholder(surveyProjectId);
  const recommended = ai.recommended;

  const businessProjectId = `${DEMO_KPI_PREFIX}${code}`;
  let estimateId: string | null = null;
  const project = getBusinessProject(businessProjectId);

  if (project) {
    const sell = Number(recommended.estimatedSellJpy ?? 350000);
    const items: EstimateLineItem[] = [
      {
        id: uuid(),
        category: "other",
        name: "AI見積（デモ採用）",
        quantity: 1,
        unit: "式",
        unitPrice: sell,
        amount: sell,
        costPrice: Math.round(sell * 0.58),
        fromAiCandidate: true,
      },
      {
        id: uuid(),
        category: "device",
        name: "ESP32（AI推奨）",
        quantity: Number(recommended.espCount ?? 2),
        unit: "台",
        unitPrice: 22000,
        amount: Number(recommended.espCount ?? 2) * 22000,
        costPrice: 11000,
        fromAiCandidate: true,
      },
    ];
    updateBusinessProject(businessProjectId, { status: "survey_done" }, SKIP);
    if (!project.estimateId) {
      const est = createEstimate(businessProjectId, items, { fromAi: true });
      estimateId = est.id;
      updateBusinessProject(
        businessProjectId,
        { estimateId: est.id, status: "estimate_created" },
        SKIP
      );
    } else {
      estimateId = project.estimateId;
    }
  }

  const steps: DemoAiEstimateStep[] = [
    { step: "select_photos", status: "done", detail: `${photoIds.length} 枚選択` },
    { step: "ai_candidates", status: "done", detail: "mock AI 候補生成" },
    { step: "adopt", status: "done", detail: "候補を採用（mock）" },
    { step: "apply_estimate", status: estimateId ? "done" : "pending", detail: estimateId ?? undefined },
  ];

  return {
    customerCode: code,
    surveyProjectId,
    photoIds,
    aiCandidate: recommended,
    businessProjectId,
    estimateId,
    steps,
  };
}

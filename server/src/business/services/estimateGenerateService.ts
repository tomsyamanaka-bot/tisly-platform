import { createEstimate, getBusinessProject, saveAiCandidate } from "../business-store.js";
import type { Estimate } from "../business-types.js";
import { normalizeLineItems } from "../estimate-math.js";
import { getLatestSurveyAnalysisV4 } from "../../survey/ai-survey-analysis-v4.js";
import { runSurveyAnalysisV4 } from "../../survey/ai-survey-analysis-v4.js";
import { getSurveyProject } from "../../survey/survey-store.js";
import { appendProjectTimeline } from "../../toms/project-timeline.js";

export interface EstimateGenerateInput {
  projectId: string;
  surveyProjectId?: string;
  runAnalysis?: boolean;
}

export interface EstimateGenerateResult {
  estimate: Estimate;
  analysis: ReturnType<typeof getLatestSurveyAnalysisV4>;
  tomsFormat: {
    materials: Array<{ name: string; quantity: number; unit: string; unitPrice: number }>;
    laborHours: number;
    laborDays: number;
  };
}

export function generateEstimateFromSurvey(input: EstimateGenerateInput): EstimateGenerateResult {
  const project = getBusinessProject(input.projectId);
  if (!project) throw new Error("project not found");

  const surveyProjectId = input.surveyProjectId ?? project.surveyProjectId;
  if (!surveyProjectId) throw new Error("surveyProjectId required");

  if (!getSurveyProject(surveyProjectId)) throw new Error("survey project not found");

  const analysis =
    input.runAnalysis !== false
      ? runSurveyAnalysisV4(surveyProjectId)
      : getLatestSurveyAnalysisV4(surveyProjectId);
  if (!analysis) throw new Error("survey analysis not found — run analysis first");

  const shellyCount = Math.max(1, Math.ceil(analysis.espCount / 2));
  const materials = [
    { name: "防犯カメラ（PoE）", quantity: analysis.cameraCount, unit: "台", unitPrice: 45000 },
    { name: "ESP32 制御盤", quantity: analysis.espCount, unit: "式", unitPrice: 85000 },
    { name: "Shelly Pro 4PM", quantity: shellyCount, unit: "台", unitPrice: 12000 },
    { name: "PoE スイッチ", quantity: Math.ceil(analysis.poeCount / 8), unit: "台", unitPrice: 28000 },
    { name: "LAN 配線工事", quantity: Math.ceil(analysis.lanDistanceM / 10), unit: "10m", unitPrice: 8000 },
    {
      name: "PoE 電源ユニット",
      quantity: analysis.hasPanel ? 2 : 1,
      unit: "式",
      unitPrice: analysis.hasPanel ? 35000 : 18000,
    },
  ];
  if (analysis.hasPanel) {
    materials.push({ name: "分電盤取付・配線", quantity: 1, unit: "式", unitPrice: 35000 });
  }

  const laborDays = Math.max(1, Math.ceil(analysis.manHours / 8));
  const laborLine = {
    name: "施工費（人工）",
    quantity: laborDays,
    unit: "日",
    unitPrice: 55000,
  };

  const items = normalizeLineItems([
    ...materials.map((m) => ({
      category: "material",
      name: m.name,
      quantity: m.quantity,
      unit: m.unit,
      unitPrice: m.unitPrice,
      costPrice: Math.round(m.unitPrice * 0.65),
      fromAiCandidate: true,
    })),
    {
      category: "labor",
      name: laborLine.name,
      quantity: laborLine.quantity,
      unit: laborLine.unit,
      unitPrice: laborLine.unitPrice,
      costPrice: Math.round(laborLine.unitPrice * 0.5),
      fromAiCandidate: true,
    },
  ]);

  saveAiCandidate(input.projectId, {
    version: "v4",
    summary: `カメラ${analysis.cameraCount} / ESP${analysis.espCount} / Shelly${shellyCount} / LAN${analysis.lanDistanceM}m`,
    cameraCount: analysis.cameraCount,
    espCount: analysis.espCount,
    lanDistanceM: analysis.lanDistanceM,
    poeCount: analysis.poeCount,
    hasPanel: analysis.hasPanel,
    crewCount: analysis.crewCount,
    manHours: analysis.manHours,
    lines: items,
  }, "survey_ai");

  const estimate = createEstimate(input.projectId, items, { fromAi: true });

  appendProjectTimeline({
    projectId: input.projectId,
    eventType: "ai_estimate",
    detail: `AI Estimate v4 自動生成 — ${estimate.estimateNo}`,
    metadata: { estimateId: estimate.id, analysisId: analysis.id },
  });

  return {
    estimate,
    analysis,
    tomsFormat: {
      materials,
      laborHours: analysis.manHours,
      laborDays,
    },
  };
}

import { getBusinessProject } from "../business/business-store.js";
import { getDatabase } from "../db/database.js";
import {
  generateEstimateFromSurvey,
  type EstimateGenerateResult,
} from "../business/services/estimateGenerateService.js";
import { runSurveyAnalysisV4 } from "../survey/ai-survey-analysis-v4.js";
import { getSurveyProject } from "../survey/survey-store.js";

export interface EstimateV4Candidate {
  category: "LAN" | "Camera" | "ESP" | "Shelly" | "電源" | "工事費";
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface ProjectEstimateV4Result {
  phase: string;
  projectId: string;
  surveyProjectId: string;
  estimate: EstimateGenerateResult["estimate"];
  candidates: EstimateV4Candidate[];
  analysis: EstimateGenerateResult["analysis"];
  tomsFormat: EstimateGenerateResult["tomsFormat"];
}

export function buildEstimateV4Candidates(
  analysis: NonNullable<EstimateGenerateResult["analysis"]>,
  tomsFormat: EstimateGenerateResult["tomsFormat"]
): EstimateV4Candidate[] {
  const shellyCount = Math.max(1, Math.ceil(analysis.espCount / 2));
  const powerCount = analysis.hasPanel ? 2 : 1;
  const candidates: EstimateV4Candidate[] = [
    {
      category: "Camera",
      name: "防犯カメラ（PoE）",
      quantity: analysis.cameraCount,
      unit: "台",
      unitPrice: 45000,
    },
    {
      category: "ESP",
      name: "ESP32 制御盤",
      quantity: analysis.espCount,
      unit: "式",
      unitPrice: 85000,
    },
    {
      category: "Shelly",
      name: "Shelly Pro 4PM",
      quantity: shellyCount,
      unit: "台",
      unitPrice: 12000,
    },
    {
      category: "LAN",
      name: "LAN 配線工事",
      quantity: Math.ceil(analysis.lanDistanceM / 10),
      unit: "10m",
      unitPrice: 8000,
    },
    {
      category: "電源",
      name: "PoE 電源・分電",
      quantity: powerCount,
      unit: "式",
      unitPrice: analysis.hasPanel ? 35000 : 18000,
    },
    {
      category: "工事費",
      name: "施工費（人工）",
      quantity: tomsFormat.laborDays,
      unit: "日",
      unitPrice: 55000,
    },
  ];
  if (analysis.hasPanel) {
    candidates.splice(4, 0, {
      category: "電源",
      name: "分電盤取付・配線",
      quantity: 1,
      unit: "式",
      unitPrice: 35000,
    });
  }
  return candidates;
}

export function generateProjectEstimateV4(
  projectId: string,
  opts?: { runAnalysis?: boolean }
): ProjectEstimateV4Result {
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");
  const surveyProjectId = project.surveyProjectId;
  if (!surveyProjectId) throw new Error("surveyProjectId not linked — run 現調 first");
  if (!getSurveyProject(surveyProjectId)) throw new Error("survey project not found");

  if (opts?.runAnalysis !== false) {
    runSurveyAnalysisV4(surveyProjectId);
  }

  const result = generateEstimateFromSurvey({
    projectId,
    surveyProjectId,
    runAnalysis: false,
  });

  return {
    phase: "1621-1680",
    projectId,
    surveyProjectId,
    estimate: result.estimate,
    candidates: buildEstimateV4Candidates(result.analysis!, result.tomsFormat),
    analysis: result.analysis,
    tomsFormat: result.tomsFormat,
  };
}

export function findBusinessProjectBySurvey(surveyProjectId: string): string | null {
  const row = getDatabase()
    .prepare(`SELECT id FROM business_projects WHERE survey_project_id = ? LIMIT 1`)
    .get(surveyProjectId) as { id: string } | undefined;
  return row?.id ?? null;
}

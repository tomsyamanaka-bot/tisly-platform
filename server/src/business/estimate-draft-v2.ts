import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getBusinessProject } from "./business-store.js";
import {
  getLatestSurveyAnalysisV2,
  runSurveyAnalysisV2,
  type EstimateCandidateV2,
} from "../survey/ai-survey-analysis-v2.js";
import { appendProjectTimeline } from "../toms/project-timeline.js";

export interface EstimateDraftLineV2 {
  id: string;
  materialCategory: string;
  laborCategory: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  costPrice: number;
  grossProfitRate: number;
  memo: string;
  customerDescription: string;
}

export interface EstimateDraftV2 {
  id: string;
  projectId: string;
  version: string;
  lines: EstimateDraftLineV2[];
  subtotal: number;
  totalCost: number;
  grossProfit: number;
  grossProfitRate: number;
  status: "draft" | "finalized";
  createdAt: string;
  updatedAt: string;
}

const MATERIAL_MAP: Record<string, string> = {
  device: "機器",
  material: "材料",
  labor: "工事",
};

function calcLine(
  line: Omit<EstimateDraftLineV2, "grossProfitRate"> & { id?: string }
): EstimateDraftLineV2 {
  const amount = line.quantity * line.unitPrice;
  const cost = line.quantity * line.costPrice;
  const grossProfitRate = amount > 0 ? Math.round(((amount - cost) / amount) * 1000) / 10 : 0;
  return {
    ...line,
    id: line.id || `DL-${uuid().slice(0, 6).toUpperCase()}`,
    grossProfitRate,
  };
}

function candidatesToLines(candidates: EstimateCandidateV2[]): EstimateDraftLineV2[] {
  return candidates.map((c) => {
    const costPrice = Math.round(c.unitPrice * (c.category === "labor" ? 0.5 : 0.62));
    const isLabor = c.category === "labor";
    return calcLine({
      id: c.id,
      materialCategory: isLabor ? "" : MATERIAL_MAP[c.category] ?? "機器",
      laborCategory: isLabor ? "配線・設置" : "",
      name: c.name,
      quantity: c.quantity,
      unit: c.unit,
      unitPrice: c.unitPrice,
      costPrice,
      memo: c.memo ?? "",
      customerDescription: isLabor
        ? `${c.name} — 安全・丁寧な施工をお約束します`
        : `${c.name} — 高品質機器を使用し、長期保守に対応`,
    });
  });
}

function summarize(lines: EstimateDraftLineV2[]) {
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const totalCost = lines.reduce((s, l) => s + l.quantity * l.costPrice, 0);
  const grossProfit = subtotal - totalCost;
  const grossProfitRate = subtotal > 0 ? Math.round((grossProfit / subtotal) * 1000) / 10 : 0;
  return { subtotal, totalCost, grossProfit, grossProfitRate };
}

function rowToDraft(row: Record<string, unknown>): EstimateDraftV2 {
  const lines = JSON.parse(String(row.lines_json ?? "[]")) as EstimateDraftLineV2[];
  const sums = summarize(lines);
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    version: String(row.version ?? "v2"),
    lines,
    ...sums,
    status: String(row.status) as EstimateDraftV2["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function createEstimateDraftV2(
  projectId: string,
  opts?: { runAnalysis?: boolean }
): EstimateDraftV2 {
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");
  const surveyProjectId = project.surveyProjectId;
  if (!surveyProjectId) throw new Error("surveyProjectId required");

  const analysis =
    opts?.runAnalysis !== false
      ? runSurveyAnalysisV2(surveyProjectId)
      : getLatestSurveyAnalysisV2(surveyProjectId);
  if (!analysis) throw new Error("survey analysis v2 not found");

  const lines = candidatesToLines(analysis.estimateCandidates);
  const sums = summarize(lines);
  const id = `ED2-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  getDatabase()
    .prepare(
      `INSERT INTO business_estimate_drafts_v2 (
        id, project_id, version, lines_json, subtotal, total_cost, gross_profit, gross_profit_rate,
        status, created_at, updated_at
      ) VALUES (?, ?, 'v2', ?, ?, ?, ?, ?, 'draft', ?, ?)`
    )
    .run(
      id,
      projectId,
      JSON.stringify(lines),
      sums.subtotal,
      sums.totalCost,
      sums.grossProfit,
      sums.grossProfitRate,
      now,
      now
    );

  appendProjectTimeline({
    projectId,
    eventType: "ai_estimate",
    title: "見積ドラフト v2 作成",
    detail: `行数 ${lines.length} / 粗利率 ${sums.grossProfitRate}%`,
    metadata: { draftId: id, version: "v2" },
  });

  return getEstimateDraftV2(id)!;
}

export function getEstimateDraftV2(id: string): EstimateDraftV2 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM business_estimate_drafts_v2 WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToDraft(row) : null;
}

export function getLatestEstimateDraftV2(projectId: string): EstimateDraftV2 | null {
  const row = getDatabase()
    .prepare(
      `SELECT * FROM business_estimate_drafts_v2 WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(projectId) as Record<string, unknown> | undefined;
  return row ? rowToDraft(row) : null;
}

export function patchEstimateDraftV2(
  id: string,
  patch: { lines?: EstimateDraftLineV2[]; status?: EstimateDraftV2["status"] }
): EstimateDraftV2 | null {
  const current = getEstimateDraftV2(id);
  if (!current) return null;

  const lines = patch.lines ?? current.lines;
  const sums = summarize(lines);
  const status = patch.status ?? current.status;
  const now = new Date().toISOString();

  getDatabase()
    .prepare(
      `UPDATE business_estimate_drafts_v2 SET
        lines_json = ?, subtotal = ?, total_cost = ?, gross_profit = ?, gross_profit_rate = ?,
        status = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      JSON.stringify(lines),
      sums.subtotal,
      sums.totalCost,
      sums.grossProfit,
      sums.grossProfitRate,
      status,
      now,
      id
    );

  return getEstimateDraftV2(id);
}

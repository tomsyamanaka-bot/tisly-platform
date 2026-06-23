/**
 * Phase16-2 — 案件不足一覧（現調/図面/見積/請求/完了報告）
 */
import { getDatabase } from "../db/database.js";
import { getProjectDocumentsStatusV1 } from "./project-documents-v1.js";

export type OperationalChecklistKeyV1 =
  | "survey"
  | "drawing"
  | "estimate"
  | "invoice"
  | "completion";

export interface OperationalChecklistItemV1 {
  key: OperationalChecklistKeyV1;
  label: string;
  done: boolean;
}

export interface OperationalChecklistV1 {
  items: OperationalChecklistItemV1[];
  doneCount: number;
  total: number;
  allDone: boolean;
}

function hasDrawing(surveyProjectId: string | null): boolean {
  if (!surveyProjectId) return false;
  try {
    const row = getDatabase()
      .prepare(`SELECT COUNT(*) AS c FROM survey_drawing_sketches WHERE project_id = ?`)
      .get(surveyProjectId) as { c?: number } | undefined;
    return Number(row?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

function docReady(projectId: string, kind: string): boolean {
  const docs = getProjectDocumentsStatusV1(projectId);
  const doc = docs?.documents.find((d) => d.kind === kind);
  if (!doc) return false;
  return doc.hasPdf || doc.status === "ready";
}

export function buildOperationalChecklistV1(input: {
  projectId: string;
  surveyProjectId: string | null;
  hasEstimate: boolean;
  hasInvoice: boolean;
}): OperationalChecklistV1 {
  const survey = Boolean(input.surveyProjectId);
  const drawing = hasDrawing(input.surveyProjectId);
  const estimate = input.hasEstimate || docReady(input.projectId, "estimate");
  const invoice = input.hasInvoice || docReady(input.projectId, "invoice");
  const completion = docReady(input.projectId, "completion");

  const items: OperationalChecklistItemV1[] = [
    { key: "survey", label: "現調", done: survey },
    { key: "drawing", label: "図面", done: drawing },
    { key: "estimate", label: "見積", done: estimate },
    { key: "invoice", label: "請求", done: invoice },
    { key: "completion", label: "完了報告", done: completion },
  ];

  const doneCount = items.filter((i) => i.done).length;
  return {
    items,
    doneCount,
    total: items.length,
    allDone: doneCount === items.length,
  };
}

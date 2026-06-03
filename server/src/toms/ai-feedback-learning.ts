import { getDatabase } from "../db/database.js";

export interface AiFeedbackLearningStats {
  total: number;
  adopted: number;
  revised: number;
  rejected: number;
  adoptionRate: number;
  revisionRate: number;
  rejectionRate: number;
  topRevisedFields: Array<{ field: string; count: number }>;
}

export interface AiLearningCandidateHints {
  preferLineItems: string[];
  avoidLineItems: string[];
  revisionNotes: string[];
  confidenceBoost: number;
}

export function aggregateAiFeedbackLearning(projectId?: string): AiFeedbackLearningStats {
  const where = projectId ? "WHERE project_id = ?" : "";
  const params = projectId ? [projectId] : [];
  const rows = getDatabase()
    .prepare(`SELECT action, candidate_json, notes FROM ai_estimate_feedback ${where}`)
    .all(...params) as Array<{
    action: string;
    candidate_json: string;
    notes: string;
  }>;

  let adopted = 0;
  let revised = 0;
  let rejected = 0;
  const fieldCounts = new Map<string, number>();

  for (const row of rows) {
    if (row.action === "adopted") adopted += 1;
    else if (row.action === "revised") revised += 1;
    else if (row.action === "rejected") rejected += 1;

    if (row.action !== "revised") continue;
    try {
      const c = JSON.parse(row.candidate_json) as Record<string, unknown>;
      const revisedFields = (c.revisedFields as string[]) ?? (c.changedFields as string[]) ?? [];
      for (const f of revisedFields) {
        fieldCounts.set(f, (fieldCounts.get(f) ?? 0) + 1);
      }
      if (row.notes) {
        const noteKey = row.notes.slice(0, 40);
        fieldCounts.set(`note:${noteKey}`, (fieldCounts.get(`note:${noteKey}`) ?? 0) + 1);
      }
    } catch {
      /* */
    }
  }

  const total = rows.length || 1;
  const topRevisedFields = [...fieldCounts.entries()]
    .filter(([k]) => !k.startsWith("note:"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([field, count]) => ({ field, count }));

  return {
    total: rows.length,
    adopted,
    revised,
    rejected,
    adoptionRate: Math.round((adopted / total) * 1000) / 10,
    revisionRate: Math.round((revised / total) * 1000) / 10,
    rejectionRate: Math.round((rejected / total) * 1000) / 10,
    topRevisedFields,
  };
}

export function buildAiLearningCandidateHints(
  projectId?: string
): AiLearningCandidateHints {
  const stats = aggregateAiFeedbackLearning(projectId);
  const preferLineItems: string[] = [];
  const avoidLineItems: string[] = [];
  const revisionNotes: string[] = [];

  for (const { field, count } of stats.topRevisedFields) {
    if (count >= 2) revisionNotes.push(`よく修正: ${field}`);
    if (field.includes("削除") || field.includes("remove")) {
      avoidLineItems.push(field);
    } else {
      preferLineItems.push(field);
    }
  }

  const confidenceBoost =
    stats.adoptionRate > 60 ? 0.1 : stats.rejectionRate > 40 ? -0.15 : 0;

  return {
    preferLineItems: preferLineItems.slice(0, 6),
    avoidLineItems: avoidLineItems.slice(0, 6),
    revisionNotes: revisionNotes.slice(0, 5),
    confidenceBoost,
  };
}

export function applyLearningToAiEstimateCandidate(
  base: Record<string, unknown>,
  projectId?: string
): Record<string, unknown> {
  const hints = buildAiLearningCandidateHints(projectId);
  const items = Array.isArray(base.lineItems) ? [...(base.lineItems as unknown[])] : [];
  const learningMeta = {
    hints,
    stats: aggregateAiFeedbackLearning(projectId),
    appliedAt: new Date().toISOString(),
  };
  return {
    ...base,
    lineItems: items,
    aiLearning: learningMeta,
    confidence: Math.min(
      1,
      Math.max(0, Number(base.confidence ?? 0.7) + hints.confidenceBoost)
    ),
  };
}

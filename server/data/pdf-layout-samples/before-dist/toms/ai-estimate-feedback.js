import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getBusinessProject } from "../business/business-store.js";
import { appendProjectTimeline } from "./project-timeline.js";
export function saveAiEstimateFeedback(input) {
    if (!getBusinessProject(input.projectId)) {
        throw new Error("project not found");
    }
    const id = `AIF-${uuid().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO ai_estimate_feedback
       (id, project_id, estimate_v3_id, action, notes, candidate_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.projectId, input.estimateV3Id ?? null, input.action, input.notes ?? "", JSON.stringify(input.candidate ?? {}), now);
    const labels = {
        adopted: "採用",
        revised: "修正",
        rejected: "却下",
    };
    appendProjectTimeline({
        projectId: input.projectId,
        eventType: "ai_estimate",
        title: `AI見積 ${labels[input.action]}`,
        detail: input.notes ?? "",
        actor: "ai-feedback",
        metadata: { feedbackId: id, action: input.action },
    });
    return {
        id,
        projectId: input.projectId,
        estimateV3Id: input.estimateV3Id ?? null,
        action: input.action,
        notes: input.notes ?? "",
        candidate: input.candidate ?? {},
        createdAt: now,
    };
}
export function listAiEstimateFeedback(projectId) {
    const rows = getDatabase()
        .prepare(`SELECT * FROM ai_estimate_feedback WHERE project_id = ? ORDER BY created_at DESC`)
        .all(projectId);
    return rows.map((r) => ({
        id: String(r.id),
        projectId: String(r.project_id),
        estimateV3Id: r.estimate_v3_id != null ? String(r.estimate_v3_id) : null,
        action: String(r.action),
        notes: String(r.notes ?? ""),
        candidate: JSON.parse(String(r.candidate_json ?? "{}")),
        createdAt: String(r.created_at),
    }));
}

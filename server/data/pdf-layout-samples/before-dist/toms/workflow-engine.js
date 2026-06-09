import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getBusinessProject, updateBusinessProject } from "../business/business-store.js";
import { normalizeProjectStatus } from "../business/business-status.js";
import { appendProjectTimeline, timelineTitleFor } from "./project-timeline.js";
import { TOMS_WORKFLOW_STATES } from "./toms-types.js";
const ALLOWED = {
    draft: ["survey", "closed"],
    survey: ["estimate", "draft", "closed"],
    estimate: ["approved", "survey"],
    approved: ["construction", "estimate"],
    construction: ["completed", "approved"],
    completed: ["invoiced", "construction"],
    invoiced: ["paid", "completed"],
    paid: ["maintenance", "closed"],
    maintenance: ["closed", "paid"],
    closed: [],
};
const STATUS_TO_TOMS = {
    new: "draft",
    survey_scheduled: "survey",
    survey_done: "survey",
    estimate_created: "estimate",
    estimate_sent: "approved",
    estimate_sent_to_owner: "approved",
    accepted: "approved",
    construction_scheduled: "construction",
    construction_done: "completed",
    completion_report_created: "completed",
    invoice_created: "invoiced",
    invoice_sent: "invoiced",
    invoice_sent_to_owner: "invoiced",
    partial_paid: "paid",
    paid: "paid",
    payment_scheduled: "invoiced",
    closed: "closed",
    archived: "closed",
};
const TOMS_TO_STATUS = {
    draft: "new",
    survey: "survey_scheduled",
    estimate: "estimate_created",
    approved: "estimate_sent",
    construction: "construction_scheduled",
    completed: "construction_done",
    invoiced: "invoice_created",
    paid: "paid",
    maintenance: "paid",
    closed: "closed",
};
const TOMS_TIMELINE = {
    survey: "survey",
    estimate: "ai_estimate",
    approved: "estimate_sent",
    construction: "construction_start",
    completed: "construction_complete",
    invoiced: "invoice",
    paid: "payment",
    maintenance: "maintenance_start",
    closed: "maintenance_complete",
};
export function businessStatusToToms(status) {
    const n = normalizeProjectStatus(status);
    return STATUS_TO_TOMS[n] ?? "draft";
}
export function getTomsWorkflowState(projectId) {
    const p = getBusinessProject(projectId);
    if (!p)
        return null;
    return businessStatusToToms(p.status);
}
export function listWorkflowHistory(projectId, limit = 100) {
    const rows = getDatabase()
        .prepare(`SELECT * FROM toms_workflow_history WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`)
        .all(projectId, limit);
    return rows.map((r) => ({
        id: String(r.id),
        projectId: String(r.project_id),
        fromState: String(r.from_state),
        toState: String(r.to_state),
        note: String(r.note ?? ""),
        actor: String(r.actor ?? ""),
        createdAt: String(r.created_at),
    }));
}
export function transitionTomsWorkflow(projectId, to, opts) {
    if (!TOMS_WORKFLOW_STATES.includes(to)) {
        throw new Error(`invalid toms state: ${to}`);
    }
    const project = getBusinessProject(projectId);
    if (!project)
        throw new Error("project not found");
    const from = businessStatusToToms(project.status);
    const allowed = ALLOWED[from] ?? [];
    if (!allowed.includes(to)) {
        throw new Error(`transition not allowed: ${from} -> ${to}`);
    }
    const targetStatus = TOMS_TO_STATUS[to];
    const id = `WF-${uuid().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO toms_workflow_history (id, project_id, from_state, to_state, note, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, projectId, from, to, opts?.note ?? "", opts?.actor ?? "workflow", now);
    updateBusinessProject(projectId, { status: targetStatus }, { skipTransitionCheck: true });
    const tlType = TOMS_TIMELINE[to];
    if (tlType) {
        appendProjectTimeline({
            projectId,
            eventType: tlType,
            title: timelineTitleFor(tlType),
            detail: opts?.note ?? `${from} → ${to}`,
            actor: opts?.actor ?? "workflow",
        });
    }
    return { state: to, projectStatus: targetStatus };
}
export function recordWorkflowFromBusinessStatus(projectId, fromStatus, toStatus, actor = "business") {
    const from = businessStatusToToms(fromStatus);
    const to = businessStatusToToms(toStatus);
    if (from === to)
        return;
    const id = `WF-${uuid().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO toms_workflow_history (id, project_id, from_state, to_state, note, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, projectId, from, to, `business:${fromStatus}->${toStatus}`, actor, now);
}

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getBusinessProject } from "../business/business-store.js";
import { appendProjectTimeline } from "./project-timeline.js";
import { transitionTomsWorkflow } from "./workflow-engine.js";
function rowToCase(r) {
    let targetDevices = [];
    let photos = [];
    try {
        targetDevices = JSON.parse(String(r.target_devices_json ?? "[]"));
    }
    catch {
        targetDevices = [];
    }
    try {
        photos = JSON.parse(String(r.photos_json ?? "[]"));
    }
    catch {
        photos = [];
    }
    return {
        caseId: String(r.case_id),
        projectId: String(r.project_id),
        scheduledDate: String(r.scheduled_date),
        content: String(r.content ?? ""),
        targetDevices,
        photos,
        assignee: String(r.assignee ?? ""),
        status: String(r.status),
        closedAt: r.closed_at != null ? String(r.closed_at) : null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}
export function listMaintenanceDueSoon(daysAhead = 14) {
    const today = new Date();
    const rows = getDatabase()
        .prepare(`SELECT * FROM toms_project_maintenance WHERE status != 'closed'
       ORDER BY scheduled_date ASC`)
        .all();
    return rows
        .map((r) => {
        const c = rowToCase(r);
        const sched = new Date(c.scheduledDate);
        const daysUntil = Math.ceil((sched.getTime() - today.getTime()) / 86400000);
        return { ...c, daysUntil, overdue: daysUntil < 0 };
    })
        .filter((c) => c.daysUntil <= daysAhead);
}
export function listProjectMaintenance(projectId) {
    const rows = getDatabase()
        .prepare(`SELECT * FROM toms_project_maintenance WHERE project_id = ?
       ORDER BY scheduled_date ASC`)
        .all(projectId);
    return rows.map(rowToCase);
}
export function createProjectMaintenance(input) {
    if (!getBusinessProject(input.projectId)) {
        throw new Error("project not found");
    }
    const caseId = `PMC-${uuid().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO toms_project_maintenance
       (case_id, project_id, scheduled_date, content, target_devices_json, photos_json,
        assignee, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`)
        .run(caseId, input.projectId, input.scheduledDate, input.content ?? "", JSON.stringify(input.targetDevices ?? []), JSON.stringify(input.photos ?? []), input.assignee ?? "", now, now);
    appendProjectTimeline({
        projectId: input.projectId,
        eventType: "maintenance_start",
        detail: input.content ?? "保守案件を登録しました",
        actor: input.assignee ?? "system",
    });
    return rowToCase(getDatabase()
        .prepare(`SELECT * FROM toms_project_maintenance WHERE case_id = ?`)
        .get(caseId));
}
export function closeProjectMaintenance(projectId, caseId, actor) {
    const row = getDatabase()
        .prepare(`SELECT * FROM toms_project_maintenance WHERE case_id = ? AND project_id = ?`)
        .get(caseId, projectId);
    if (!row)
        return null;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`UPDATE toms_project_maintenance SET status = 'closed', closed_at = ?, updated_at = ?
       WHERE case_id = ?`)
        .run(now, now, caseId);
    appendProjectTimeline({
        projectId,
        eventType: "maintenance_complete",
        detail: "保守案件を完了しました",
        actor: actor ?? "system",
    });
    try {
        transitionTomsWorkflow(projectId, "closed", {
            actor: actor ?? "system",
            note: "保守完了により案件をクローズ",
        });
    }
    catch {
        /* workflow may already be closed */
    }
    return rowToCase(getDatabase()
        .prepare(`SELECT * FROM toms_project_maintenance WHERE case_id = ?`)
        .get(caseId));
}

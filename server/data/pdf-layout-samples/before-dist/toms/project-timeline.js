import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
const EVENT_LABELS = {
    project_created: "案件作成",
    survey: "現調",
    drawing: "図面作成",
    ai_estimate: "AI見積",
    estimate_sent: "見積送信",
    construction_start: "施工開始",
    construction_complete: "施工完了",
    completion_report: "完了報告",
    invoice: "請求",
    payment: "入金",
    maintenance_start: "保守開始",
    maintenance_complete: "保守完了",
    pro_operations: "PRO運用",
};
export function timelineTitleFor(eventType) {
    return EVENT_LABELS[eventType] ?? eventType;
}
export function appendProjectTimeline(input) {
    const id = `TL-${uuid().slice(0, 8).toUpperCase()}`;
    const title = input.title ?? timelineTitleFor(input.eventType);
    const detail = input.detail ?? "";
    const actor = input.actor ?? "system";
    const metadataJson = JSON.stringify(input.metadata ?? {});
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO business_project_timeline
       (id, project_id, event_type, title, detail, actor, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.projectId, input.eventType, title, detail, actor, metadataJson, now);
    return {
        id,
        projectId: input.projectId,
        eventType: input.eventType,
        title,
        detail,
        actor,
        metadata: input.metadata ?? {},
        createdAt: now,
    };
}
export function listProjectTimeline(projectId, limit = 200) {
    const rows = getDatabase()
        .prepare(`SELECT * FROM business_project_timeline
       WHERE project_id = ? ORDER BY created_at ASC LIMIT ?`)
        .all(projectId, limit);
    return rows.map(rowToTimeline);
}
function rowToTimeline(r) {
    let metadata = {};
    try {
        metadata = JSON.parse(String(r.metadata_json ?? "{}"));
    }
    catch {
        metadata = {};
    }
    return {
        id: String(r.id),
        projectId: String(r.project_id),
        eventType: String(r.event_type),
        title: String(r.title),
        detail: String(r.detail ?? ""),
        actor: String(r.actor ?? ""),
        metadata,
        createdAt: String(r.created_at),
    };
}
export function seedTimelineFromProject(projectId, createdAt) {
    const existing = getDatabase()
        .prepare(`SELECT COUNT(*) as c FROM business_project_timeline WHERE project_id = ?`)
        .get(projectId);
    if (existing.c > 0)
        return;
    appendProjectTimeline({
        projectId,
        eventType: "project_created",
        detail: "案件が登録されました",
        actor: "system",
        metadata: { seeded: true },
    });
    getDatabase()
        .prepare(`UPDATE business_project_timeline SET created_at = ? WHERE project_id = ? AND event_type = ?`)
        .run(createdAt, projectId, "project_created");
}

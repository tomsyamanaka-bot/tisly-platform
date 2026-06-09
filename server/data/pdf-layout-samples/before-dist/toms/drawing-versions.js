import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
export function createDrawingVersion(input) {
    const max = getDatabase()
        .prepare(`SELECT COALESCE(MAX(version_no), 0) as m FROM business_drawing_versions
         WHERE project_id = ? AND version_kind = ?`)
        .get(input.projectId, input.versionKind).m;
    const id = `DV-${uuid().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const versionNo = max + 1;
    getDatabase()
        .prepare(`INSERT INTO business_drawing_versions
       (id, project_id, version_kind, version_no, title, file_path, drawing_plan_id, notes, devices_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.projectId, input.versionKind, versionNo, input.title, input.filePath ?? "", input.drawingPlanId ?? null, input.notes ?? "", JSON.stringify(input.devices ?? []), now);
    return getDrawingVersion(id);
}
export function getDrawingVersion(id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM business_drawing_versions WHERE id = ?`)
        .get(id);
    return row ? rowToVersion(row) : null;
}
export function listDrawingVersions(projectId) {
    const rows = getDatabase()
        .prepare(`SELECT * FROM business_drawing_versions WHERE project_id = ?
       ORDER BY version_kind, version_no ASC`)
        .all(projectId);
    return rows.map(rowToVersion);
}
function rowToVersion(r) {
    let devices = [];
    try {
        devices = JSON.parse(String(r.devices_json ?? "[]"));
    }
    catch {
        devices = [];
    }
    return {
        id: String(r.id),
        projectId: String(r.project_id),
        versionKind: String(r.version_kind),
        versionNo: Number(r.version_no),
        title: String(r.title),
        filePath: String(r.file_path ?? ""),
        drawingPlanId: r.drawing_plan_id != null ? String(r.drawing_plan_id) : null,
        notes: String(r.notes ?? ""),
        devices,
        createdAt: String(r.created_at),
    };
}

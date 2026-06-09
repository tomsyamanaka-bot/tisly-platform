import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getSurveyProject, getSurveyChecklist, listSurveyPhotos, listSurveyDrawings, } from "./survey-store.js";
export function runSurveyAiIntake(projectId, input) {
    const project = getSurveyProject(projectId);
    if (!project)
        throw new Error("project not found");
    const photos = listSurveyPhotos(projectId);
    const drawings = listSurveyDrawings(projectId);
    const checklist = getSurveyChecklist(projectId);
    const checked = Object.entries(checklist).filter(([, v]) => typeof v === "object" && v && v.checked).length;
    const exterior = photos.filter((p) => p.photoType === "outside" || p.photoType === "aerial").length;
    const interior = photos.filter((p) => p.photoType === "inside").length;
    const panel = photos.filter((p) => p.photoType === "panel" || p.photoType === "electrical").length;
    const network = photos.filter((p) => p.photoType === "network").length;
    const cameras = photos.filter((p) => p.photoType === "camera").length;
    const sensors = photos.filter((p) => p.photoType === "sensor").length;
    const hazard = checklist.hazard_zones?.note?.trim() || "";
    const risk_points = hazard
        ? hazard.split(/[,、\n]/).map((s) => s.trim()).filter(Boolean)
        : checked < 4
            ? ["チェックリスト未完了 — 現場再確認推奨"]
            : [];
    const result = {
        placeholder: true,
        provider: "rule-based-v1",
        rooms: [
            { name: "玄関", floor: "1F" },
            { name: "リビング", floor: "1F" },
            { name: "廊下", floor: "1F" },
            ...(interior > 2 ? [{ name: "2F洋室", floor: "2F" }] : []),
        ],
        exterior_points: Array.from({ length: Math.max(2, exterior) }, (_, i) => ({
            label: `外周ポイント${i + 1}`,
            posHint: "perimeter",
        })),
        entry_points: [{ label: "正面玄関" }, ...(exterior > 1 ? [{ label: "勝手口候補" }] : [])],
        windows: Math.max(4, interior * 2),
        doors: Math.max(2, Math.ceil(interior / 2) + 1),
        stairs: interior > 4 ? 1 : 0,
        electrical_panel: { count: Math.max(1, panel), notes: panel ? "分電盤写真あり" : "要現地確認" },
        network_point: { count: Math.max(1, network), notes: network ? "回線写真あり" : "LAN経路要確認" },
        risk_points,
        recommended_devices: [
            { type: "esp32", qty: Math.max(1, Math.ceil(sensors / 2) + 1), reason: "センサー集約" },
            { type: "pir", qty: Math.max(2, sensors + 1), reason: "室内動線" },
            {
                type: "camera",
                qty: Math.max(1, cameras + (checklist.camera?.checked ? 1 : 0)),
                reason: "外周・玄関",
            },
            { type: "shelly", qty: Math.max(1, panel), reason: "照明・回路" },
            { type: "beam", qty: drawings.length > 0 ? 2 : 1, reason: "図面ベース配置候補" },
        ],
    };
    if (input?.notes) {
        getDatabase()
            .prepare(`INSERT INTO survey_project_notes (project_id, notes, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(project_id) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at`)
            .run(projectId, input.notes);
    }
    const id = uuid();
    getDatabase()
        .prepare(`INSERT INTO survey_ai_intakes (id, project_id, input_json, result_json, created_at) VALUES (?, ?, ?, ?, datetime('now'))`)
        .run(id, projectId, JSON.stringify({ notes: input?.notes, gps: input?.gps ?? { lat: project.gpsLat, lng: project.gpsLng } }), JSON.stringify(result));
    getDatabase()
        .prepare(`UPDATE survey_projects SET status = 'active', updated_at = datetime('now') WHERE project_id = ?`)
        .run(projectId);
    return result;
}
export function getLatestAiIntake(projectId) {
    const row = getDatabase()
        .prepare(`SELECT result_json FROM survey_ai_intakes WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`)
        .get(projectId);
    if (!row)
        return null;
    try {
        return JSON.parse(row.result_json);
    }
    catch {
        return null;
    }
}

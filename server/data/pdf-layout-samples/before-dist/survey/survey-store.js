import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
export const SURVEY_PHOTO_TYPES = [
    "outside",
    "inside",
    "drawing",
    "aerial",
    "electrical",
    "network",
    "panel",
    "camera",
    "sensor",
    "route",
    "other",
];
export const SURVEY_DRAWING_MIME = new Set([
    "image/jpeg",
    "image/png",
    "application/pdf",
]);
export const DEFAULT_CHECKLIST_KEYS = [
    "line",
    "wifi",
    "camera",
    "power",
    "panel",
    "lan_route",
    "sensor_candidates",
    "notify_targets",
    "hazard_zones",
    "install_difficulty",
];
function rowToProject(r) {
    return {
        projectId: String(r.project_id),
        customerCode: String(r.customer_code),
        siteName: String(r.site_name),
        address: r.address != null ? String(r.address) : null,
        gpsLat: r.gps_lat != null ? Number(r.gps_lat) : null,
        gpsLng: r.gps_lng != null ? Number(r.gps_lng) : null,
        status: String(r.status),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}
export function surveyUploadsDir(projectId, photoType) {
    const dir = path.join(process.cwd(), "uploads", "survey", projectId, photoType);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
export function surveyDrawingsDir(projectId) {
    const dir = path.join(process.cwd(), "uploads", "survey", projectId, "drawings");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
export function isValidSurveyPhotoType(t) {
    return SURVEY_PHOTO_TYPES.includes(t);
}
export function createSurveyProject(input) {
    const projectId = `SVY-${uuid().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const status = input.status ?? "draft";
    getDatabase()
        .prepare(`INSERT INTO survey_projects (project_id, customer_code, site_name, address, gps_lat, gps_lng, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(projectId, input.customerCode.toUpperCase(), input.siteName, input.address ?? null, input.gpsLat ?? null, input.gpsLng ?? null, status, now, now);
    return getSurveyProject(projectId);
}
export function getSurveyProject(projectId) {
    const row = getDatabase()
        .prepare(`SELECT * FROM survey_projects WHERE project_id = ?`)
        .get(projectId);
    return row ? rowToProject(row) : null;
}
export function listSurveyProjects(customerCode) {
    const rows = customerCode
        ? getDatabase()
            .prepare(`SELECT * FROM survey_projects WHERE customer_code = ? ORDER BY updated_at DESC`)
            .all(customerCode.toUpperCase())
        : getDatabase()
            .prepare(`SELECT * FROM survey_projects ORDER BY updated_at DESC`)
            .all();
    return rows.map(rowToProject);
}
export function updateSurveyProject(projectId, patch) {
    const existing = getSurveyProject(projectId);
    if (!existing)
        return null;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`UPDATE survey_projects SET
        site_name = ?, address = ?, gps_lat = ?, gps_lng = ?, status = ?,
        customer_code = COALESCE(?, customer_code), updated_at = ?
       WHERE project_id = ?`)
        .run(patch.siteName ?? existing.siteName, patch.address !== undefined ? patch.address : existing.address, patch.gpsLat !== undefined ? patch.gpsLat : existing.gpsLat, patch.gpsLng !== undefined ? patch.gpsLng : existing.gpsLng, patch.status ?? existing.status, patch.customerCode?.toUpperCase() ?? null, now, projectId);
    return getSurveyProject(projectId);
}
export function deleteSurveyProject(projectId) {
    const dir = path.join(process.cwd(), "uploads", "survey", projectId);
    if (fs.existsSync(dir))
        fs.rmSync(dir, { recursive: true, force: true });
    const r = getDatabase().prepare(`DELETE FROM survey_projects WHERE project_id = ?`).run(projectId);
    return r.changes > 0;
}
export function saveSurveyPhoto(params) {
    if (!getSurveyProject(params.projectId))
        throw new Error("project not found");
    const photoType = isValidSurveyPhotoType(params.photoType) ? params.photoType : "other";
    const ext = path.extname(params.fileName ?? ".jpg") || ".jpg";
    const fname = `${uuid()}${ext}`;
    const full = path.join(surveyUploadsDir(params.projectId, photoType), fname);
    fs.writeFileSync(full, Buffer.from(params.imageBase64, "base64"));
    const rel = path.join(params.projectId, photoType, fname).replace(/\\/g, "/");
    const id = uuid();
    getDatabase()
        .prepare(`INSERT INTO survey_photos (id, project_id, photo_type, photo_path, uploaded_by) VALUES (?, ?, ?, ?, ?)`)
        .run(id, params.projectId, photoType, rel, params.uploadedBy ?? null);
    return { id, photoPath: rel, url: `/uploads/survey/${rel}` };
}
export function listSurveyPhotos(projectId) {
    const rows = getDatabase()
        .prepare(`SELECT id, photo_type, photo_path, uploaded_by, datetime(created_at) as created_at
       FROM survey_photos WHERE project_id = ? ORDER BY created_at DESC`)
        .all(projectId);
    return rows.map((r) => ({
        id: r.id,
        photoType: r.photo_type,
        photoPath: r.photo_path,
        url: `/uploads/survey/${r.photo_path}`,
        uploadedBy: r.uploaded_by,
        createdAt: r.created_at,
    }));
}
export function saveSurveyDrawing(params) {
    if (!getSurveyProject(params.projectId))
        throw new Error("project not found");
    const ext = path.extname(params.fileName ?? ".png").toLowerCase() || ".png";
    if (![".jpg", ".jpeg", ".png", ".pdf"].includes(ext)) {
        throw new Error("Allowed: jpg, png, pdf");
    }
    const fname = `${uuid()}${ext}`;
    const full = path.join(surveyDrawingsDir(params.projectId), fname);
    fs.writeFileSync(full, Buffer.from(params.imageBase64, "base64"));
    const rel = path.join(params.projectId, "drawings", fname).replace(/\\/g, "/");
    const id = uuid();
    getDatabase()
        .prepare(`INSERT INTO survey_drawings (id, project_id, file_path, file_name, mime_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, params.projectId, rel, params.fileName ?? fname, params.mimeType ?? null, params.uploadedBy ?? null);
    return { id, filePath: rel, url: `/uploads/survey/${rel}` };
}
export function listSurveyDrawings(projectId) {
    const rows = getDatabase()
        .prepare(`SELECT id, file_path, file_name, mime_type, pro_floor_id, datetime(created_at) as created_at
       FROM survey_drawings WHERE project_id = ? ORDER BY created_at DESC`)
        .all(projectId);
    return rows.map((r) => ({
        id: r.id,
        filePath: r.file_path,
        fileName: r.file_name,
        mimeType: r.mime_type,
        proFloorId: r.pro_floor_id,
        url: `/uploads/survey/${r.file_path}`,
        createdAt: r.created_at,
    }));
}
export function deleteSurveyDrawing(drawingId) {
    const row = getDatabase()
        .prepare(`SELECT file_path FROM survey_drawings WHERE id = ?`)
        .get(drawingId);
    if (!row)
        return false;
    const full = path.join(process.cwd(), "uploads", "survey", row.file_path);
    if (fs.existsSync(full))
        fs.unlinkSync(full);
    getDatabase().prepare(`DELETE FROM survey_drawings WHERE id = ?`).run(drawingId);
    return true;
}
export function defaultChecklist() {
    const labels = {
        line: "回線",
        wifi: "WiFi",
        camera: "カメラ",
        power: "電源",
        panel: "分電盤",
        lan_route: "LAN経路",
        sensor_candidates: "センサー候補",
        notify_targets: "通知先",
        hazard_zones: "危険箇所",
        install_difficulty: "施工難易度",
    };
    const out = {};
    for (const k of DEFAULT_CHECKLIST_KEYS) {
        out[k] = { label: labels[k] ?? k, checked: false, note: "" };
    }
    return out;
}
export function getSurveyChecklist(projectId) {
    const row = getDatabase()
        .prepare(`SELECT checklist_json FROM survey_checklists WHERE project_id = ?`)
        .get(projectId);
    if (!row)
        return defaultChecklist();
    try {
        return JSON.parse(row.checklist_json);
    }
    catch {
        return defaultChecklist();
    }
}
export function saveSurveyChecklist(projectId, checklist) {
    if (!getSurveyProject(projectId))
        throw new Error("project not found");
    const json = JSON.stringify(checklist);
    getDatabase()
        .prepare(`INSERT INTO survey_checklists (project_id, checklist_json, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(project_id) DO UPDATE SET checklist_json = excluded.checklist_json, updated_at = excluded.updated_at`)
        .run(projectId, json);
}
export function getSurveyProjectNotes(projectId) {
    const row = getDatabase()
        .prepare(`SELECT notes FROM survey_project_notes WHERE project_id = ?`)
        .get(projectId);
    return row?.notes ?? null;
}
export function updateSurveyPhotoType(photoId, photoType) {
    if (!isValidSurveyPhotoType(photoType))
        return false;
    const r = getDatabase()
        .prepare(`UPDATE survey_photos SET photo_type = ? WHERE id = ?`)
        .run(photoType, photoId);
    return r.changes > 0;
}
export function getLatestAiEstimate(projectId) {
    const row = getDatabase()
        .prepare(`SELECT id, result_json FROM survey_ai_estimates WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`)
        .get(projectId);
    if (!row)
        return null;
    try {
        const parsed = JSON.parse(row.result_json);
        return { id: row.id, recommended: parsed.recommended ?? parsed };
    }
    catch {
        return null;
    }
}
export function createAiEstimatePlaceholder(projectId) {
    if (!getSurveyProject(projectId))
        throw new Error("project not found");
    const photos = listSurveyPhotos(projectId);
    const drawings = listSurveyDrawings(projectId);
    const checklist = getSurveyChecklist(projectId);
    const checked = Object.values(checklist).filter((v) => typeof v === "object" && v && v.checked).length;
    const diffNoteLen = checklist.install_difficulty?.note?.length ?? 0;
    const difficultyScore = diffNoteLen > 40 ? 8 : diffNoteLen > 20 ? 6 : checked >= 6 ? 4 : 3;
    const sensorPhotos = photos.filter((p) => p.photoType === "sensor");
    const cameraPhotos = photos.filter((p) => p.photoType === "camera");
    const panelPhotos = photos.filter((p) => p.photoType === "panel" || p.photoType === "electrical");
    const recommended = {
        kind: "survey_candidate",
        placeholder: true,
        phase: "501-520",
        espCount: Math.max(1, Math.ceil(sensorPhotos.length / 2) + 1),
        sensors: [
            { type: "pir", qty: Math.max(2, sensorPhotos.length + 1) },
            { type: "door", qty: 2 },
            { type: "beam", qty: drawings.length > 0 ? 2 : 1 },
        ],
        cameras: [
            { type: "outdoor", qty: Math.max(1, cameraPhotos.length) },
            { type: "indoor", qty: Math.max(1, Math.floor(photos.filter((p) => p.photoType === "inside").length / 3)) },
        ],
        lights: [{ type: "shelly_dimmer", qty: Math.max(1, panelPhotos.length) }],
        shelly: [{ type: "plus_1pm", qty: Math.max(1, panelPhotos.length) }],
        estimatedWorkDays: Math.max(1, Math.ceil((photos.length + drawings.length) / 8)),
        difficultyScore,
        estimatedCostJpy: 180000 + photos.length * 12000 + drawings.length * 25000,
        estimatedSellJpy: 320000 + photos.length * 22000 + drawings.length * 45000,
        cautions: [
            checked < 5 ? "チェックリスト未完了 — 再現調推奨" : null,
            panelPhotos.length === 0 ? "分電盤写真なし — 電源設計要確認" : null,
        ].filter(Boolean),
        inputSummary: {
            photoCount: photos.length,
            drawingCount: drawings.length,
            checklistItemsChecked: checked,
        },
    };
    const result = { placeholder: true, phase: "501-520", recommended };
    const id = uuid();
    getDatabase()
        .prepare(`INSERT INTO survey_ai_estimates (id, project_id, result_json) VALUES (?, ?, ?)`)
        .run(id, projectId, JSON.stringify(result));
    return { id, recommended };
}
export function linkDrawingToProFloor(drawingId, proFloorId) {
    const r = getDatabase()
        .prepare(`UPDATE survey_drawings SET pro_floor_id = ? WHERE id = ?`)
        .run(proFloorId, drawingId);
    return r.changes > 0;
}
export function importSurveyDrawingToProLayer(drawingId, layerId) {
    const drawing = getDatabase()
        .prepare(`SELECT file_path, project_id FROM survey_drawings WHERE id = ?`)
        .get(drawingId);
    const layer = getDatabase()
        .prepare(`SELECT id, floor_id FROM pro_floor_layers WHERE id = ?`)
        .get(layerId);
    if (!drawing || !layer)
        return false;
    const src = path.join(process.cwd(), "uploads", "survey", drawing.file_path);
    if (!fs.existsSync(src))
        return false;
    const ext = path.extname(drawing.file_path);
    const destName = `survey-${drawingId.slice(0, 8)}${ext}`;
    const destDir = path.join(process.cwd(), "uploads", "floorplans");
    fs.mkdirSync(destDir, { recursive: true });
    const destFull = path.join(destDir, destName);
    fs.copyFileSync(src, destFull);
    getDatabase()
        .prepare(`UPDATE pro_floor_layers SET image_path = ?, survey_drawing_id = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(destName, drawingId, layerId);
    if (layer.floor_id) {
        getDatabase()
            .prepare(`UPDATE floors SET floor_plan_path = ?, updated_at = datetime('now') WHERE id = ?`)
            .run(destName, layer.floor_id);
        getDatabase()
            .prepare(`INSERT INTO floor_maps (id, floor_id, image_path, updated_at) VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(floor_id) DO UPDATE SET image_path = excluded.image_path, updated_at = excluded.updated_at`)
            .run(uuid(), layer.floor_id, destName);
    }
    linkDrawingToProFloor(drawingId, layer.floor_id ?? layerId);
    return true;
}

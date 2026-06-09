import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getSurveyChecklist, getSurveyProject, listSurveyDrawings, listSurveyPhotos, } from "./survey-store.js";
import { listSurveyAudio } from "./survey-field-media.js";
import { getLatestSurveyAnalysisV4 } from "./ai-survey-analysis-v4.js";
function countByPhotoType(photos, types) {
    return photos.filter((p) => types.includes(p.photoType)).length;
}
function checklistChecked(checklist, key) {
    const item = checklist[key];
    if (!item || typeof item !== "object")
        return false;
    return Boolean(item.checked);
}
export function runSurveyAnalysisV2(projectId) {
    const project = getSurveyProject(projectId);
    if (!project)
        throw new Error("project not found");
    const photos = listSurveyPhotos(projectId);
    const drawings = listSurveyDrawings(projectId);
    const audio = listSurveyAudio(projectId);
    const checklist = getSurveyChecklist(projectId);
    const v4 = getLatestSurveyAnalysisV4(projectId);
    const cameraPhotos = countByPhotoType(photos, ["camera", "outside", "route"]);
    const sensorPhotos = countByPhotoType(photos, ["sensor", "inside"]);
    const panelPhotos = countByPhotoType(photos, ["panel", "electrical"]);
    const networkPhotos = countByPhotoType(photos, ["network", "route"]);
    const perimeterCount = Math.max(2, cameraPhotos, checklistChecked(checklist, "camera") ? 3 : 0);
    const entranceCount = Math.max(1, Math.ceil(cameraPhotos / 3));
    const sensorCount = Math.max(2, sensorPhotos, checklistChecked(checklist, "sensor") ? 4 : 0);
    const lanDistanceEstimateM = v4?.lanDistanceM ?? Math.max(20, networkPhotos * 15 + drawings.length * 25);
    const perimeterCameras = Array.from({ length: perimeterCount }, (_, i) => ({
        label: `外周カメラ ${i + 1}`,
        reason: i === 0 ? "玄関動線・駐車場" : "塀・門扉・裏庭",
        confidence: 0.7 + (photos.length > 0 ? 0.1 : 0),
    }));
    const entranceCameras = Array.from({ length: entranceCount }, (_, i) => ({
        label: i === 0 ? "玄関ドアカメラ" : `玄関サブ ${i}`,
        reason: "来客・宅配・侵入検知",
        confidence: 0.75,
    }));
    const indoorSensors = Array.from({ length: sensorCount }, (_, i) => ({
        label: `室内センサー ${i + 1}`,
        type: i % 2 === 0 ? "PIR" : "ドア開閉",
        confidence: 0.65 + (sensorPhotos > 0 ? 0.15 : 0),
    }));
    const powerOutlets = [
        { label: "分電盤付近", location: panelPhotos > 0 ? "写真確認済" : "要現地確認" },
        { label: "カメラ取付位置", location: "PoE給電 or 近傍コンセント" },
        ...(panelPhotos > 0 ? [{ label: "制御盤設置", location: "分電盤横スペース" }] : []),
    ];
    const shellyPlacements = [
        { label: "Shelly Pro 4PM", purpose: "照明・シャッター連動" },
        { label: "Shelly Plus 1PM", purpose: "室外灯タイマー" },
        ...(sensorCount > 2 ? [{ label: "Shelly Plus H&T", purpose: "温湿度監視" }] : []),
    ];
    const constructionNotes = [
        lanDistanceEstimateM > 60 ? "LAN配線 60m超 — 2名施工推奨" : "LAN配線 標準施工",
        panelPhotos > 0 ? "分電盤取付あり — 電気工事士同行" : "分電盤位置要確認",
        drawings.length > 0 ? `図面 ${drawings.length} 件参照済` : "図面未登録 — 現調図面推奨",
        audio.length > 0 ? `音声メモ ${audio.length} 件反映` : "",
    ].filter(Boolean);
    const riskNotes = [
        photos.length < 3 ? "現調写真が少ない — 見積精度が低下" : "",
        !checklistChecked(checklist, "wifi") ? "Wi-Fi/回線状況未確認" : "",
        !checklistChecked(checklist, "line") ? "LAN配線ルート未確認" : "",
        drawings.length === 0 ? "図面なし — 配線距離は概算" : "",
    ].filter(Boolean);
    const missingInfo = [
        photos.length === 0 ? "外周・玄関の写真" : "",
        drawings.length === 0 ? "平面図または手書きスケッチ" : "",
        !project.gpsLat ? "現場GPS座標" : "",
        audio.length === 0 ? "現場音声メモ（施工注意点）" : "",
        !checklistChecked(checklist, "panel") ? "分電盤写真・容量" : "",
    ].filter(Boolean);
    const estimateCandidates = [
        {
            id: "EC-PERIM",
            category: "device",
            name: "外周防犯カメラ（PoE）",
            quantity: perimeterCount,
            unit: "台",
            unitPrice: 48000,
            memo: "夜間赤外線・広角",
        },
        {
            id: "EC-ENTR",
            category: "device",
            name: "玄関カメラ（ドアベル連動）",
            quantity: entranceCount,
            unit: "台",
            unitPrice: 42000,
        },
        {
            id: "EC-SENS",
            category: "device",
            name: "室内センサー",
            quantity: sensorCount,
            unit: "台",
            unitPrice: 12000,
        },
        {
            id: "EC-LAN",
            category: "labor",
            name: "LAN配線工事",
            quantity: Math.ceil(lanDistanceEstimateM / 10),
            unit: "10m",
            unitPrice: 8500,
            memo: `概算 ${lanDistanceEstimateM}m`,
        },
        {
            id: "EC-SHELLY",
            category: "device",
            name: "Shelly スマートリレー",
            quantity: shellyPlacements.length,
            unit: "台",
            unitPrice: 9800,
        },
        {
            id: "EC-ESP",
            category: "device",
            name: "ESP32 制御盤",
            quantity: Math.max(1, Math.ceil((perimeterCount + sensorCount) / 4)),
            unit: "式",
            unitPrice: 85000,
        },
        {
            id: "EC-LABOR",
            category: "labor",
            name: "施工費（人工）",
            quantity: v4?.crewCount === 2 ? 2 : 1,
            unit: "日",
            unitPrice: 55000,
            memo: `推定 ${v4?.manHours ?? 8} 人工時間`,
        },
    ];
    const confidence = Math.min(0.92, 0.5 +
        photos.length * 0.025 +
        drawings.length * 0.06 +
        (checklistChecked(checklist, "line") ? 0.05 : 0) +
        (v4 ? 0.08 : 0));
    const id = `SA2-${uuid().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const payload = {
        perimeterCameras,
        entranceCameras,
        indoorSensors,
        lanDistanceEstimateM,
        powerOutlets,
        shellyPlacements,
        constructionNotes,
        estimateCandidates,
        riskNotes,
        missingInfo,
        confidence,
    };
    getDatabase()
        .prepare(`INSERT INTO survey_analysis_v2 (id, project_id, result_json, created_at) VALUES (?, ?, ?, ?)`)
        .run(id, projectId, JSON.stringify(payload), now);
    return { id, projectId, ...payload, createdAt: now };
}
export function getLatestSurveyAnalysisV2(projectId) {
    const row = getDatabase()
        .prepare(`SELECT * FROM survey_analysis_v2 WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`)
        .get(projectId);
    if (!row)
        return null;
    const result = JSON.parse(String(row.result_json));
    return {
        id: String(row.id),
        projectId: String(row.project_id),
        ...result,
        createdAt: String(row.created_at),
    };
}

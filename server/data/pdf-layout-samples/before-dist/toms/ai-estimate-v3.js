import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getBusinessProject } from "../business/business-store.js";
import { listDrawingPlans } from "../business/drawing-store.js";
import { saveAiCandidate } from "../business/business-store.js";
import { applyLearningToAiEstimateCandidate } from "./ai-feedback-learning.js";
function countSymbols(projectId) {
    let esp = 0;
    let light = 0;
    let camera = 0;
    let lanM = 0;
    for (const plan of listDrawingPlans(projectId)) {
        for (const s of plan.symbols) {
            const t = String(s.label ?? "").toLowerCase();
            if (t.includes("esp") || t.includes("controller"))
                esp += 1;
            else if (t.includes("light") || t.includes("照明"))
                light += 1;
            else if (t.includes("camera") || t.includes("カメラ"))
                camera += 1;
        }
        for (const r of plan.routes) {
            lanM += Math.round(Number(r.estimatedLength ?? r.points?.length ?? 10));
        }
    }
    return { esp, light, camera, lanM };
}
export function generateAiEstimateV3(projectId) {
    const project = getBusinessProject(projectId);
    if (!project)
        throw new Error("project not found");
    const photoCount = project.surveyPhotos.length + project.constructionPhotos.length;
    const symbolCounts = countSymbols(projectId);
    const espCount = Math.max(symbolCounts.esp, Math.ceil(photoCount / 8));
    const lightCount = Math.max(symbolCounts.light, Math.floor(photoCount / 4));
    const cameraCount = Math.max(symbolCounts.camera, 2);
    const lanDistanceM = Math.max(symbolCounts.lanM, 30);
    const constructionDays = Math.max(1, Math.ceil((espCount + cameraCount) / 3));
    const checklist = [
        photoCount > 0 ? "現調写真: OK" : "現調写真: 未登録",
        project.surveyMemo ? "現調メモ: OK" : "現調メモ: 要確認",
        symbolCounts.esp + symbolCounts.camera > 0 ? "図面記号: OK" : "図面記号: 推定",
        "TOMS標準単価候補を生成",
    ];
    const lines = [
        { description: "ESP制御盤設置", quantity: espCount, unit: "式", unitPrice: 85000 },
        { description: "照明連動（Shelly）", quantity: lightCount, unit: "口", unitPrice: 12000 },
        { description: "防犯カメラ設置", quantity: cameraCount, unit: "台", unitPrice: 45000 },
        { description: "LAN配線工事", quantity: Math.ceil(lanDistanceM / 10), unit: "10m", unitPrice: 8000 },
        { description: "施工費（人工）", quantity: constructionDays, unit: "日", unitPrice: 55000 },
    ];
    const recommended = applyLearningToAiEstimateCandidate({
        version: "v3",
        summary: `ESP ${espCount} / 照明 ${lightCount} / カメラ ${cameraCount} / LAN ${lanDistanceM}m / ${constructionDays}日`,
        espCount,
        lightCount,
        cameraCount,
        lanDistanceM,
        constructionDays,
        recommendedLines: lines,
        lineItems: lines,
        confidence: photoCount > 2 ? 0.82 : 0.65,
        notes: checklist.join("; "),
    }, projectId);
    const candidate = saveAiCandidate(projectId, recommended, "manual");
    const id = `AIV3-${uuid().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO toms_ai_estimate_v3
       (id, project_id, esp_count, light_count, camera_count, lan_distance_m, construction_days,
        checklist_json, candidate_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, projectId, espCount, lightCount, cameraCount, lanDistanceM, constructionDays, JSON.stringify(checklist), JSON.stringify(recommended), now);
    return {
        id,
        projectId,
        espCount,
        lightCount,
        cameraCount,
        lanDistanceM,
        constructionDays,
        checklist,
        candidate,
        createdAt: now,
    };
}
export function getLatestAiEstimateV3(projectId) {
    const row = getDatabase()
        .prepare(`SELECT * FROM toms_ai_estimate_v3 WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`)
        .get(projectId);
    if (!row)
        return null;
    return {
        id: String(row.id),
        projectId: String(row.project_id),
        espCount: Number(row.esp_count),
        lightCount: Number(row.light_count),
        cameraCount: Number(row.camera_count),
        lanDistanceM: Number(row.lan_distance_m),
        constructionDays: Number(row.construction_days),
        checklist: JSON.parse(String(row.checklist_json ?? "[]")),
        candidate: {
            id: String(row.id),
            projectId: String(row.project_id),
            source: "manual",
            recommended: JSON.parse(String(row.candidate_json ?? "{}")),
            applied: false,
            createdAt: String(row.created_at),
        },
        createdAt: String(row.created_at),
    };
}

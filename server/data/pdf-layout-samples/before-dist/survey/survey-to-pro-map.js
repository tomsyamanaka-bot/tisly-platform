import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { PRO_FLOOR_TIERS, ensureProFloorLayersSeed } from "../pro-remote/floor-map-stack.js";
import { getSurveyProject, listSurveyPhotos, listSurveyDrawings, importSurveyDrawingToProLayer, } from "./survey-store.js";
const TIER_LABELS = {
    perimeter: "外周",
    "1f": "1F",
    "2f": "2F",
};
const PHOTO_TIER_HINT = {
    aerial: "perimeter",
    outside: "perimeter",
    inside: "1f",
    route: "1f",
    camera: "perimeter",
    sensor: "1f",
    network: "1f",
    electrical: "1f",
    panel: "1f",
};
/** Never creates roof/屋上 — only 外周 / 1F / 2F. */
export function generateFloorMapFromSurvey(projectId) {
    const project = getSurveyProject(projectId);
    if (!project)
        throw new Error("project not found");
    const customer = getCustomerByCode(project.customerCode);
    if (!customer)
        throw new Error("customer not found");
    ensureProFloorLayersSeed();
    const database = getDatabase();
    const site = database
        .prepare(`SELECT id FROM sites WHERE customer_id = ? ORDER BY name LIMIT 1`)
        .get(customer.customer_id);
    if (!site)
        throw new Error("site not found");
    const photos = listSurveyPhotos(projectId);
    const drawings = listSurveyDrawings(projectId);
    const layersOut = [];
    for (const tier of PRO_FLOOR_TIERS) {
        const layer = database
            .prepare(`SELECT id, display_name, image_path FROM pro_floor_layers WHERE customer_id = ? AND tier = ? LIMIT 1`)
            .get(customer.customer_id, tier);
        if (!layer)
            continue;
        const tierPhotos = photos.filter((p) => (PHOTO_TIER_HINT[p.photoType] ?? "1f") === tier);
        const tierDrawing = drawings.find((d) => !d.proFloorId);
        if (tierDrawing && !layer.image_path) {
            importSurveyDrawingToProLayer(tierDrawing.id, layer.id);
        }
        else if (tierPhotos.length > 0 && !layer.image_path) {
            const srcPhoto = tierPhotos[0];
            const srcFull = path.join(process.cwd(), "uploads", "survey", srcPhoto.photoPath);
            if (fs.existsSync(srcFull)) {
                const ext = path.extname(srcPhoto.photoPath) || ".jpg";
                const destName = `survey-${projectId.slice(4, 12)}-${tier}${ext}`;
                const destDir = path.join(process.cwd(), "uploads", "floorplans");
                fs.mkdirSync(destDir, { recursive: true });
                fs.copyFileSync(srcFull, path.join(destDir, destName));
                database
                    .prepare(`UPDATE pro_floor_layers SET image_path = ?, updated_at = datetime('now') WHERE id = ?`)
                    .run(destName, layer.id);
                const floorId = database
                    .prepare(`SELECT floor_id FROM pro_floor_layers WHERE id = ?`)
                    .get(layer.id);
                if (floorId?.floor_id) {
                    database
                        .prepare(`UPDATE floors SET floor_plan_path = ?, updated_at = datetime('now') WHERE id = ?`)
                        .run(destName, floorId.floor_id);
                    database
                        .prepare(`INSERT INTO floor_maps (id, floor_id, image_path, updated_at) VALUES (?, ?, ?, datetime('now'))
               ON CONFLICT(floor_id) DO UPDATE SET image_path = excluded.image_path, updated_at = excluded.updated_at`)
                        .run(uuid(), floorId.floor_id, destName);
                }
            }
        }
        const refreshed = database
            .prepare(`SELECT id, display_name, image_path, tier FROM pro_floor_layers WHERE id = ?`)
            .get(layer.id);
        layersOut.push({
            layerId: refreshed.id,
            tier: refreshed.tier,
            displayName: refreshed.display_name || TIER_LABELS[refreshed.tier] || refreshed.tier,
            imageUrl: refreshed.image_path ? `/uploads/floorplans/${refreshed.image_path}` : null,
        });
    }
    database
        .prepare(`INSERT INTO survey_floor_map_links (project_id, customer_code, linked_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(project_id) DO UPDATE SET linked_at = excluded.linked_at`)
        .run(projectId, project.customerCode);
    return {
        customerCode: project.customerCode,
        tiers: [...PRO_FLOOR_TIERS],
        layers: layersOut.sort((a, b) => PRO_FLOOR_TIERS.indexOf(a.tier) - PRO_FLOOR_TIERS.indexOf(b.tier)),
        roofCreated: false,
    };
}
export function getSurveyProMapLink(projectId) {
    const row = getDatabase()
        .prepare(`SELECT customer_code FROM survey_floor_map_links WHERE project_id = ?`)
        .get(projectId);
    return { linked: !!row, customerCode: row?.customer_code ?? null };
}

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { DRAWING_SYMBOL_SEED } from "./drawing-symbol-seed.js";
function parseJson(raw, fallback) {
    if (!raw)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
function rowToDrawingPlan(r) {
    return {
        id: String(r.id),
        projectId: String(r.project_id),
        title: String(r.title),
        sourceType: String(r.source_type),
        backgroundImagePath: String(r.background_image_path ?? ""),
        cleanImagePath: String(r.clean_image_path ?? ""),
        tradeType: String(r.trade_type),
        symbols: parseJson(r.symbols_json, []),
        routes: parseJson(r.routes_json, []),
        notes: String(r.notes ?? ""),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}
export function seedDrawingSymbolsIfEmpty() {
    const count = getDatabase().prepare(`SELECT COUNT(*) as c FROM business_drawing_symbols`).get().c;
    if (count > 0)
        return 0;
    const stmt = getDatabase().prepare(`INSERT INTO business_drawing_symbols (
      id, trade_type, symbol_type, label, icon, color, default_estimate_item_id, memo, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`);
    for (const s of DRAWING_SYMBOL_SEED) {
        stmt.run(uuid(), s.tradeType, s.symbolType, s.label, s.icon, s.color, null, s.memo);
    }
    return DRAWING_SYMBOL_SEED.length;
}
export function listDrawingSymbols(tradeType) {
    seedDrawingSymbolsIfEmpty();
    const rows = tradeType
        ? getDatabase()
            .prepare(`SELECT * FROM business_drawing_symbols WHERE trade_type = ? ORDER BY label`)
            .all(tradeType)
        : getDatabase()
            .prepare(`SELECT * FROM business_drawing_symbols ORDER BY trade_type, label`)
            .all();
    return rows.map((r) => ({
        id: String(r.id),
        tradeType: String(r.trade_type),
        symbolType: String(r.symbol_type),
        label: String(r.label),
        icon: String(r.icon),
        color: String(r.color),
        defaultEstimateItemId: r.default_estimate_item_id != null ? String(r.default_estimate_item_id) : null,
        memo: String(r.memo ?? ""),
    }));
}
export function createDrawingPlan(input) {
    const id = uuid();
    const now = new Date().toISOString();
    const plan = {
        id,
        projectId: input.projectId,
        title: input.title ?? "施工図",
        sourceType: input.sourceType ?? "blank",
        backgroundImagePath: "",
        cleanImagePath: "",
        tradeType: input.tradeType ?? "security_camera",
        symbols: [],
        routes: [],
        notes: "",
        createdAt: now,
        updatedAt: now,
    };
    getDatabase()
        .prepare(`INSERT INTO business_drawing_plans (
        id, project_id, title, source_type, background_image_path, clean_image_path,
        trade_type, symbols_json, routes_json, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(plan.id, plan.projectId, plan.title, plan.sourceType, plan.backgroundImagePath, plan.cleanImagePath, plan.tradeType, "[]", "[]", plan.notes, plan.createdAt, plan.updatedAt);
    return plan;
}
export function getDrawingPlan(id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM business_drawing_plans WHERE id = ?`)
        .get(id);
    return row ? rowToDrawingPlan(row) : null;
}
export function listDrawingPlans(projectId) {
    return getDatabase()
        .prepare(`SELECT * FROM business_drawing_plans WHERE project_id = ? ORDER BY updated_at DESC`)
        .all(projectId)
        .map((r) => rowToDrawingPlan(r));
}
export function updateDrawingPlan(id, patch) {
    const existing = getDrawingPlan(id);
    if (!existing)
        throw new Error("Drawing plan not found");
    const next = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    getDatabase()
        .prepare(`UPDATE business_drawing_plans SET
        title = ?, source_type = ?, background_image_path = ?, clean_image_path = ?,
        trade_type = ?, symbols_json = ?, routes_json = ?, notes = ?, updated_at = ?
      WHERE id = ?`)
        .run(next.title, next.sourceType, next.backgroundImagePath, next.cleanImagePath, next.tradeType, JSON.stringify(next.symbols), JSON.stringify(next.routes), next.notes, next.updatedAt, id);
    return next;
}
export function countDrawingPlansInProgress() {
    return getDatabase()
        .prepare(`SELECT COUNT(*) as c FROM business_drawing_plans dp
         JOIN business_projects p ON p.id = dp.project_id
         WHERE json_array_length(dp.symbols_json) = 0
         AND p.status NOT IN ('closed', 'paid')`)
        .get().c;
}
export function countProjectsWithoutSpecification() {
    return getDatabase()
        .prepare(`SELECT COUNT(DISTINCT p.id) as c FROM business_projects p
         WHERE EXISTS (SELECT 1 FROM business_drawing_plans dp WHERE dp.project_id = p.id)
         AND NOT EXISTS (SELECT 1 FROM business_specification_docs sd WHERE sd.project_id = p.id)
         AND p.status NOT IN ('closed')`)
        .get().c;
}
export function countDrawingEstimateNotApplied() {
    return getDatabase()
        .prepare(`SELECT COUNT(DISTINCT dp.project_id) as c FROM business_drawing_plans dp
         WHERE json_array_length(dp.symbols_json) > 0
         AND NOT EXISTS (
           SELECT 1 FROM business_ai_candidates ac
           WHERE ac.project_id = dp.project_id AND ac.applied = 1
         )`)
        .get().c;
}
export function saveSpecificationDocument(doc) {
    getDatabase()
        .prepare(`INSERT OR REPLACE INTO business_specification_docs (
        id, project_id, drawing_plan_id, title, overview, included_trades_json,
        material_summary, work_summary, notes, pdf_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(doc.id, doc.projectId, doc.drawingPlanId, doc.title, doc.overview, JSON.stringify(doc.includedTrades), doc.materialSummary, doc.workSummary, doc.notes, doc.pdfPath, doc.createdAt, doc.updatedAt);
}
export function getSpecificationDocument(projectId, id) {
    const row = id
        ? getDatabase()
            .prepare(`SELECT * FROM business_specification_docs WHERE id = ? AND project_id = ?`)
            .get(id, projectId)
        : getDatabase()
            .prepare(`SELECT * FROM business_specification_docs WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1`)
            .get(projectId);
    if (!row)
        return null;
    const r = row;
    return {
        id: String(r.id),
        projectId: String(r.project_id),
        drawingPlanId: String(r.drawing_plan_id),
        title: String(r.title),
        overview: String(r.overview ?? ""),
        includedTrades: parseJson(r.included_trades_json, []),
        materialSummary: String(r.material_summary ?? ""),
        workSummary: String(r.work_summary ?? ""),
        notes: String(r.notes ?? ""),
        pdfPath: String(r.pdf_path ?? ""),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}
export function listSpecificationDocuments(projectId) {
    return getDatabase()
        .prepare(`SELECT * FROM business_specification_docs WHERE project_id = ? ORDER BY updated_at DESC`)
        .all(projectId)
        .map((row) => {
        const r = row;
        return {
            id: String(r.id),
            projectId: String(r.project_id),
            drawingPlanId: String(r.drawing_plan_id),
            title: String(r.title),
            overview: String(r.overview ?? ""),
            includedTrades: parseJson(r.included_trades_json, []),
            materialSummary: String(r.material_summary ?? ""),
            workSummary: String(r.work_summary ?? ""),
            notes: String(r.notes ?? ""),
            pdfPath: String(r.pdf_path ?? ""),
            createdAt: String(r.created_at),
            updatedAt: String(r.updated_at),
        };
    });
}

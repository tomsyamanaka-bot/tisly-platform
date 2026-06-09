import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { getFloorById } from "../site-builder/floor-store.js";
import { logAudit } from "../provisioning/audit-log.js";
export function archiveFloorplanToQnap(input) {
    const floor = getFloorById(input.floorId);
    if (!floor) {
        throw new Error("Floor not found");
    }
    const db = getDatabase();
    const site = db.prepare(`SELECT customer_id FROM sites WHERE id = ?`).get(floor.site_id);
    if (!site || site.customer_id !== input.customerId) {
        throw new Error("Floor not in customer scope");
    }
    const mapRow = db
        .prepare(`SELECT image_path FROM floor_maps WHERE floor_id = ?`)
        .get(input.floorId);
    const rel = mapRow?.image_path ?? floor.floor_plan_path;
    if (!rel) {
        throw new Error("No floorplan uploaded for this floor");
    }
    const localPath = path.join(process.cwd(), "uploads", "floorplans", path.basename(rel));
    const archiveRel = `${input.customerCode}/${floor.site_id}/floorplans/${path.basename(rel)}`;
    const mock = config.qnap.mode !== "real";
    if (mock) {
        const mockDir = path.join(process.cwd(), "data", "qnap-mock", archiveRel);
        fs.mkdirSync(path.dirname(mockDir), { recursive: true });
        if (fs.existsSync(localPath)) {
            fs.copyFileSync(localPath, mockDir);
        }
        else {
            fs.writeFileSync(mockDir, Buffer.from(""));
        }
    }
    const archivePath = `${config.qnap.basePath}/${archiveRel}`;
    db.prepare(`INSERT INTO floor_maps (id, floor_id, image_path, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(floor_id) DO UPDATE SET image_path = image_path, updated_at = excluded.updated_at`).run(uuid(), input.floorId, rel);
    logAudit({
        tenantId: input.customerId,
        actorId: input.actorId,
        action: "floorplan.archive",
        entityType: "floor",
        entityId: input.floorId,
        details: { archivePath, mock },
    });
    return {
        ok: true,
        mock,
        archivePath,
        message: mock
            ? "QNAP not connected — archived to data/qnap-mock (mock)"
            : "Archived to QNAP share (real mode placeholder)",
    };
}

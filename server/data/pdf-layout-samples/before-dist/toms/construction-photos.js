import { v4 as uuid } from "uuid";
import path from "path";
import fs from "fs";
import { getDatabase } from "../db/database.js";
import { businessUploadsDir } from "../business/business-store.js";
const KEYWORDS = [
    { category: "before", patterns: [/before|前|事前/i] },
    { category: "during", patterns: [/during|中|施工中/i] },
    { category: "after", patterns: [/after|後|完了/i] },
    { category: "panel_interior", patterns: [/panel|盤|盤内/i] },
    { category: "wiring", patterns: [/wire|配線|ケーブル/i] },
    { category: "equipment", patterns: [/equip|機器|esp|camera|nvr/i] },
    { category: "finished", patterns: [/finish|完成|竣工/i] },
];
export function classifyPhotoCategory(filename, caption = "") {
    const text = `${filename} ${caption}`;
    for (const rule of KEYWORDS) {
        if (rule.patterns.some((p) => p.test(text)))
            return rule.category;
    }
    return "during";
}
export function saveConstructionPhoto(input) {
    const auto = !input.category;
    const category = input.category ?? classifyPhotoCategory(input.originalName, input.caption);
    const dir = businessUploadsDir(input.projectId, "construction-classified");
    const ext = path.extname(input.originalName) || ".jpg";
    const fname = `${category}-${Date.now()}${ext}`;
    const full = path.join(dir, fname);
    fs.writeFileSync(full, input.buffer);
    const rel = `/uploads/business/${input.projectId}/construction-classified/${fname}`;
    const id = `CPH-${uuid().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO business_construction_photos
       (id, project_id, category, file_path, auto_classified, caption, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.projectId, category, rel, auto ? 1 : 0, input.caption ?? "", now);
    return {
        id,
        projectId: input.projectId,
        category,
        filePath: rel,
        autoClassified: auto,
        caption: input.caption ?? "",
        createdAt: now,
    };
}
export function listConstructionPhotos(projectId) {
    const rows = getDatabase()
        .prepare(`SELECT * FROM business_construction_photos WHERE project_id = ? ORDER BY created_at ASC`)
        .all(projectId);
    return rows.map((r) => ({
        id: String(r.id),
        projectId: String(r.project_id),
        category: String(r.category),
        filePath: String(r.file_path),
        autoClassified: Boolean(r.auto_classified),
        caption: String(r.caption ?? ""),
        createdAt: String(r.created_at),
    }));
}

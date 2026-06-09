import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { config } from "../config.js";
const ARCHIVE_DIR = path.join(process.cwd(), "data", "qnap-archive");
function ensureArchiveDir() {
    if (!fs.existsSync(ARCHIVE_DIR))
        fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    return ARCHIVE_DIR;
}
export function archiveEventsToFile(format = "json", days = 1) {
    const db = getDatabase();
    const rows = db
        .prepare(`SELECT * FROM events WHERE created_at >= datetime('now', ?) ORDER BY created_at`)
        .all(`-${days} day`);
    const dir = ensureArchiveDir();
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `events-${stamp}.${format === "csv" ? "csv" : "json"}`;
    const filepath = path.join(dir, filename);
    if (format === "csv") {
        const headers = [
            "id",
            "device_id",
            "event_type",
            "severity",
            "site_id",
            "zone",
            "message",
            "created_at",
        ];
        const lines = [headers.join(",")];
        for (const r of rows) {
            lines.push(headers
                .map((h) => {
                const v = String(r[h] ?? "");
                return v.includes(",") ? `"${v.replace(/"/g, '""')}"` : v;
            })
                .join(","));
        }
        fs.writeFileSync(filepath, lines.join("\n"), "utf8");
    }
    else {
        fs.writeFileSync(filepath, JSON.stringify(rows, null, 2), "utf8");
    }
    const id = uuid();
    db.prepare(`INSERT INTO qnap_archives (id, archive_type, format, file_path, record_count, created_at)
     VALUES (?, 'events', ?, ?, ?, datetime('now'))`).run(id, format, filepath, rows.length);
    return filepath;
}
export function listArchives() {
    const db = getDatabase();
    return db
        .prepare(`SELECT id, archive_type as archiveType, format, file_path as filePath,
              record_count as recordCount, created_at as createdAt
       FROM qnap_archives ORDER BY created_at DESC LIMIT 50`)
        .all();
}
/** H.View / Reolink カメラアーカイブ設計（将来実装） */
export const CAMERA_ARCHIVE_DESIGN = {
    providers: ["H.View", "Reolink"],
    storage: "QNAP Surveillance Station / SMB share",
    retentionDays: 30,
    formats: ["mp4", "snapshot-jpg"],
    status: "design_only",
    qnapPath: "/share/TiSLY/camera-archive/",
};
export function getQnapStatus() {
    return {
        connected: false,
        host: process.env.QNAP_HOST ?? "",
        archiveDir: ARCHIVE_DIR,
        publicUrl: config.publicUrl,
        cameraArchive: CAMERA_ARCHIVE_DESIGN,
        message: "デモ: ローカルファイルアーカイブ。本番は QNAP SMB/API 連携予定",
    };
}

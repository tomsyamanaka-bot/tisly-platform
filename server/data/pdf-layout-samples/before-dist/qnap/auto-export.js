import { archiveEventsToFile } from "./event-archive.js";
import { getDatabase } from "../db/database.js";
export function autoExport(format, days = 7) {
    const path = archiveEventsToFile(format, days);
    const db = getDatabase();
    const count = db
        .prepare(`SELECT COUNT(*) as c FROM events WHERE created_at >= datetime('now', ?)`)
        .get(`-${days} day`).c;
    return { path, count };
}
/** Excel は CSV で代替（本番: exceljs 連携 TODO） */
export function exportAsExcelCompatible(days = 7) {
    const path = archiveEventsToFile("csv", days);
    return {
        path,
        note: "Excel 互換 CSV。将来 xlsx 直接出力（TODO: exceljs）",
    };
}
export function generateCustomerReport(type) {
    const days = type === "weekly" ? 7 : 30;
    const path = archiveEventsToFile("json", days);
    const title = type === "weekly" ? "週報" : "月報";
    const db = getDatabase();
    const anomalies = db
        .prepare(`SELECT COUNT(*) as c FROM events WHERE created_at >= datetime('now', ?)
         AND severity IN ('alarm', 'critical')`)
        .get(`-${days} day`).c;
    const total = db
        .prepare(`SELECT COUNT(*) as c FROM events WHERE created_at >= datetime('now', ?)`)
        .get(`-${days} day`).c;
    return {
        type,
        title: `TiSLY 顧客向け${title}`,
        sections: [
            `対象期間: 過去 ${days} 日`,
            `総イベント: ${total} 件`,
            `重大異常: ${anomalies} 件`,
            `データエクスポート: ${path}`,
        ],
        exportPath: path,
    };
}

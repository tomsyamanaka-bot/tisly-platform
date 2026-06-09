import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";
function maintReportDir(customerCode) {
    const dir = path.join(process.cwd(), "uploads", "maintenance", customerCode);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
export function listMaintenanceSchedules(customerCode) {
    const rows = customerCode
        ? getDatabase()
            .prepare(`SELECT * FROM maintenance_schedules WHERE customer_code = ? ORDER BY due_date ASC`)
            .all(customerCode.toUpperCase())
        : getDatabase()
            .prepare(`SELECT * FROM maintenance_schedules ORDER BY due_date ASC`)
            .all();
    return rows.map(rowToSchedule);
}
function rowToSchedule(r) {
    return {
        scheduleId: String(r.schedule_id),
        customerCode: String(r.customer_code),
        siteId: r.site_id != null ? String(r.site_id) : null,
        title: String(r.title),
        dueDate: String(r.due_date),
        status: String(r.status),
        createdAt: String(r.created_at),
    };
}
export function createMaintenanceSchedule(input) {
    if (!getCustomerByCode(input.customerCode))
        throw new Error("customer not found");
    const scheduleId = `MSC-${uuid().slice(0, 8).toUpperCase()}`;
    getDatabase()
        .prepare(`INSERT INTO maintenance_schedules
       (schedule_id, customer_code, site_id, title, due_date, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))`)
        .run(scheduleId, input.customerCode.toUpperCase(), input.siteId ?? null, input.title, input.dueDate);
    return listMaintenanceSchedules(input.customerCode).find((s) => s.scheduleId === scheduleId);
}
export function createMaintenanceReport(input) {
    if (!getCustomerByCode(input.customerCode))
        throw new Error("customer not found");
    const reportId = `MRP-${uuid().slice(0, 8).toUpperCase()}`;
    const photoPaths = [];
    for (const photo of input.photos ?? []) {
        const ext = path.extname(photo.fileName ?? ".jpg") || ".jpg";
        const fname = `${reportId}-${uuid().slice(0, 6)}${ext}`;
        const full = path.join(maintReportDir(input.customerCode), fname);
        fs.writeFileSync(full, Buffer.from(photo.imageBase64, "base64"));
        photoPaths.push(`/uploads/maintenance/${input.customerCode.toUpperCase()}/${fname}`);
    }
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO maintenance_reports
       (report_id, schedule_id, case_id, customer_code, comment, photo_paths_json, completed_at, reported_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(reportId, input.scheduleId ?? null, input.caseId ?? null, input.customerCode.toUpperCase(), input.comment ?? null, JSON.stringify(photoPaths), now, input.reportedBy ?? null);
    if (input.scheduleId) {
        getDatabase()
            .prepare(`UPDATE maintenance_schedules SET status = 'completed' WHERE schedule_id = ?`)
            .run(input.scheduleId);
    }
    return {
        reportId,
        scheduleId: input.scheduleId ?? null,
        caseId: input.caseId ?? null,
        customerCode: input.customerCode.toUpperCase(),
        comment: input.comment ?? null,
        photos: photoPaths,
        completedAt: now,
        reportedBy: input.reportedBy ?? null,
    };
}
export function listMaintenanceReports(customerCode, limit = 50) {
    const rows = getDatabase()
        .prepare(`SELECT * FROM maintenance_reports WHERE customer_code = ? ORDER BY completed_at DESC LIMIT ?`)
        .all(customerCode.toUpperCase(), limit);
    return rows.map((r) => {
        let photos = [];
        try {
            photos = JSON.parse(String(r.photo_paths_json ?? "[]"));
        }
        catch {
            photos = [];
        }
        return {
            reportId: String(r.report_id),
            scheduleId: r.schedule_id != null ? String(r.schedule_id) : null,
            caseId: r.case_id != null ? String(r.case_id) : null,
            customerCode: String(r.customer_code),
            comment: r.comment != null ? String(r.comment) : null,
            photos,
            completedAt: String(r.completed_at),
            reportedBy: r.reported_by != null ? String(r.reported_by) : null,
        };
    });
}

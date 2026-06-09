import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { config } from "../config.js";
import { buildQnapRemotePath } from "../qnap/archive-path-builder.js";
import { logAudit } from "../provisioning/audit-log.js";
export function recordReportExport(report) {
    const archivePath = archiveReportToQnap(report);
    const status = archivePath ? "archived" : "generated";
    getDatabase()
        .prepare(`INSERT INTO customer_report_exports (
        export_id, customer_id, site_id, generated_by, generated_at,
        format, status, report_type, archive_path, html_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(report.meta.exportId, report.meta.customerId, report.meta.siteId, report.meta.generatedBy, report.meta.generatedAt, report.meta.format, status, report.meta.reportType, archivePath, report.html.slice(0, 50000));
    logAudit({
        tenantId: report.meta.customerId,
        userId: report.meta.generatedBy,
        actorLabel: report.meta.generatedBy,
        action: "report.export",
        targetType: "report_export",
        targetId: report.meta.exportId,
        afterJson: {
            format: report.meta.format,
            reportType: report.meta.reportType,
            status,
            archivePath,
        },
    });
    return {
        export_id: report.meta.exportId,
        customer_id: report.meta.customerId,
        site_id: report.meta.siteId,
        generated_by: report.meta.generatedBy,
        generated_at: report.meta.generatedAt,
        format: report.meta.format,
        status,
        report_type: report.meta.reportType,
        archive_path: archivePath,
    };
}
function archiveReportToQnap(report) {
    const siteId = report.meta.siteId ?? "all-sites";
    const tenantKey = report.meta.customerCode;
    const filename = `${report.meta.exportId}.html`;
    const remotePath = buildQnapRemotePath("reports", tenantKey, siteId, filename);
    if (config.qnap.mode === "mock") {
        try {
            getDatabase()
                .prepare(`INSERT INTO qnap_archives (id, archive_type, format, file_path, record_count)
           VALUES (?, 'reports', 'html', ?, 1)`)
                .run(uuid(), remotePath);
        }
        catch {
            /* qnap_archives may be absent in minimal DB */
        }
        return remotePath;
    }
    // TODO: real SMB upload via qnap-client
    return remotePath;
}
export function getReportExport(exportId) {
    const row = getDatabase()
        .prepare(`SELECT export_id, customer_id, site_id, generated_by, generated_at,
              format, status, report_type, archive_path
       FROM customer_report_exports WHERE export_id = ?`)
        .get(exportId);
    return row ?? null;
}

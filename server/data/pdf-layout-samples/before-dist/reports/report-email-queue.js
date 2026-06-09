import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { sendReportEmail } from "../notification/channels/email.js";
import { logAudit } from "../provisioning/audit-log.js";
export function enqueueReportEmail(input) {
    const id = uuid();
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO report_email_queue (
        id, customer_id, export_id, to_address, subject, body_html,
        attachment_name, attachment_format, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
        .run(id, input.customerId, input.exportId ?? null, input.to, input.subject, input.html, input.attachmentName ?? null, input.attachmentFormat ?? "html", now, now);
    logAudit({
        tenantId: input.customerId,
        action: "report.email_queued",
        targetType: "report_email_queue",
        targetId: id,
        afterJson: { to: input.to, exportId: input.exportId },
    });
    return getReportEmailJob(id);
}
export function getReportEmailJob(id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM report_email_queue WHERE id = ?`)
        .get(id);
    return row ?? null;
}
export function listPendingReportEmails(limit = 20) {
    return getDatabase()
        .prepare(`SELECT * FROM report_email_queue
       WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
       ORDER BY created_at ASC LIMIT ?`)
        .all(limit);
}
function nextRetryIso(attempt) {
    const delaySec = Math.min(3600, 60 * 2 ** attempt);
    return new Date(Date.now() + delaySec * 1000).toISOString();
}
export async function processReportEmailJob(job) {
    const db = getDatabase();
    const attempt = job.attempts + 1;
    const result = await sendReportEmail({
        to: job.to_address,
        subject: job.subject,
        html: job.body_html,
    });
    if (result.ok) {
        const now = new Date().toISOString();
        db.prepare(`UPDATE report_email_queue SET status = 'sent', attempts = ?, last_error = NULL,
       sent_at = ?, updated_at = ? WHERE id = ?`).run(attempt, now, now, job.id);
        logAudit({
            tenantId: job.customer_id,
            action: "report.email_sent",
            targetType: "report_email_queue",
            targetId: job.id,
            afterJson: { to: job.to_address, mock: result.error?.includes("placeholder") },
        });
    }
    else if (attempt >= job.max_attempts) {
        db.prepare(`UPDATE report_email_queue SET status = 'exhausted', attempts = ?, last_error = ?,
       updated_at = datetime('now') WHERE id = ?`).run(attempt, result.error ?? "send failed", job.id);
        logAudit({
            tenantId: job.customer_id,
            action: "report.email_exhausted",
            targetType: "report_email_queue",
            targetId: job.id,
            afterJson: { error: result.error },
        });
    }
    else {
        db.prepare(`UPDATE report_email_queue SET status = 'pending', attempts = ?, next_retry_at = ?,
       last_error = ?, updated_at = datetime('now') WHERE id = ?`).run(attempt, nextRetryIso(attempt), result.error ?? "send failed", job.id);
    }
    return getReportEmailJob(job.id);
}
export function countPendingReportEmails() {
    return getDatabase()
        .prepare(`SELECT COUNT(*) as c FROM report_email_queue WHERE status = 'pending'`)
        .get().c;
}

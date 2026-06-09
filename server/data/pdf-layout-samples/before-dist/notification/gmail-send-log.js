/**
 * Phase 2301–2350 — Gmail SMTP 送信ログ
 */
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
export function logGmailSend(input) {
    const id = uuid();
    const db = getDatabase();
    db.prepare(`INSERT INTO gmail_send_logs (id, recipient, subject, send_type, status, error_message, mock, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(id, input.recipient, input.subject, input.sendType ?? "notification", input.status, input.errorMessage ?? null, input.mock ? 1 : 0);
    return id;
}
export function listGmailSendLogs(limit = 50) {
    const db = getDatabase();
    const rows = db
        .prepare(`SELECT id, recipient, subject, send_type, status, error_message, mock, created_at
       FROM gmail_send_logs ORDER BY created_at DESC LIMIT ?`)
        .all(Math.min(limit, 200));
    return rows.map((r) => ({
        id: r.id,
        recipient: r.recipient,
        subject: r.subject,
        sendType: r.send_type,
        status: r.status,
        errorMessage: r.error_message,
        mock: r.mock === 1,
        createdAt: r.created_at,
    }));
}
export function getLastGmailSendStatus() {
    const db = getDatabase();
    const row = db
        .prepare(`SELECT status, recipient, subject, error_message, created_at
       FROM gmail_send_logs ORDER BY created_at DESC LIMIT 1`)
        .get();
    if (!row) {
        return {
            status: null,
            recipient: null,
            subject: null,
            errorMessage: null,
            createdAt: null,
        };
    }
    return {
        status: row.status,
        recipient: row.recipient,
        subject: row.subject,
        errorMessage: row.error_message,
        createdAt: row.created_at,
    };
}
export function getGmailSendStats() {
    const db = getDatabase();
    const row = db
        .prepare(`SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN mock = 1 OR status = 'mock' THEN 1 ELSE 0 END) AS mock
       FROM gmail_send_logs`)
        .get();
    const attempted = row.total - row.mock;
    const successRatePercent = attempted > 0 ? Math.round((row.sent / attempted) * 100) : 100;
    return { ...row, successRatePercent };
}

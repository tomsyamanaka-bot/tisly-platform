/**
 * Phase 2251–2300 — QNAP 送信ログ
 */
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
export function logQnapSend(input) {
    const id = uuid();
    const db = getDatabase();
    db.prepare(`INSERT INTO qnap_send_logs (id, payload_type, customer_code, device_id, file_path, status, error_message, mock, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(id, input.payloadType, input.customerCode ?? null, input.deviceId ?? null, input.filePath ?? null, input.status, input.errorMessage ?? null, input.mock ? 1 : 0);
    return id;
}
export function listQnapSendLogs(limit = 50) {
    const db = getDatabase();
    const rows = db
        .prepare(`SELECT id, payload_type, customer_code, device_id, file_path, status, error_message, mock, created_at
       FROM qnap_send_logs ORDER BY created_at DESC LIMIT ?`)
        .all(Math.min(limit, 200));
    return rows.map((r) => ({
        id: r.id,
        payloadType: r.payload_type,
        customerCode: r.customer_code,
        deviceId: r.device_id,
        filePath: r.file_path,
        status: r.status,
        errorMessage: r.error_message,
        mock: r.mock === 1,
        createdAt: r.created_at,
    }));
}
export function getQnapSendStats() {
    const db = getDatabase();
    const row = db
        .prepare(`SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN mock = 1 THEN 1 ELSE 0 END) AS mock
       FROM qnap_send_logs`)
        .get();
    const attempted = row.total - row.mock;
    const successRatePercent = attempted > 0 ? Math.round((row.sent / attempted) * 100) : 100;
    return { ...row, successRatePercent };
}

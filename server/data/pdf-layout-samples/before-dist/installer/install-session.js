import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
export function startInstallSession(input) {
    const id = uuid();
    const mode = input.mode ?? "live";
    const db = getDatabase();
    db.prepare(`INSERT INTO install_sessions (id, customer_id, site_id, installer_user_id, mode, status, started_at)
     VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))`).run(id, input.customerId, input.siteId ?? null, input.installerUserId ?? null, mode);
    return getInstallSession(id);
}
export function completeInstallSession(sessionId, customerId) {
    const db = getDatabase();
    const row = db
        .prepare(`SELECT id FROM install_sessions WHERE id = ? AND customer_id = ?`)
        .get(sessionId, customerId);
    if (!row)
        throw new Error("Session not found");
    db.prepare(`UPDATE install_sessions SET status = 'completed', completed_at = datetime('now') WHERE id = ?`).run(sessionId);
    return getInstallSession(sessionId);
}
export function listInstallSessions(customerId, limit = 50) {
    const rows = getDatabase()
        .prepare(`SELECT id, customer_id, site_id, installer_user_id, mode, started_at, completed_at, status
       FROM install_sessions WHERE customer_id = ? ORDER BY started_at DESC LIMIT ?`)
        .all(customerId, limit);
    return rows.map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        siteId: r.site_id,
        installerUserId: r.installer_user_id,
        mode: r.mode,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        status: r.status,
    }));
}
function getInstallSession(id) {
    const r = getDatabase()
        .prepare(`SELECT id, customer_id, site_id, installer_user_id, mode, started_at, completed_at, status
       FROM install_sessions WHERE id = ?`)
        .get(id);
    if (!r)
        return null;
    return {
        id: r.id,
        customerId: r.customer_id,
        siteId: r.site_id,
        installerUserId: r.installer_user_id,
        mode: r.mode,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        status: r.status,
    };
}

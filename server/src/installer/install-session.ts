import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";

export type InstallSessionMode = "live" | "dry_run" | "practice";
export type InstallSessionStatus = "active" | "completed" | "cancelled";

export interface InstallSession {
  id: string;
  customerId: string;
  siteId: string | null;
  installerUserId: string | null;
  mode: InstallSessionMode;
  startedAt: string;
  completedAt: string | null;
  status: InstallSessionStatus;
}

export function startInstallSession(input: {
  customerId: string;
  siteId?: string;
  installerUserId?: string;
  mode?: InstallSessionMode;
}): InstallSession {
  const id = uuid();
  const mode = input.mode ?? "live";
  const db = getDatabase();
  db.prepare(
    `INSERT INTO install_sessions (id, customer_id, site_id, installer_user_id, mode, status, started_at)
     VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))`
  ).run(id, input.customerId, input.siteId ?? null, input.installerUserId ?? null, mode);

  return getInstallSession(id)!;
}

export function completeInstallSession(sessionId: string, customerId: string): InstallSession {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT id FROM install_sessions WHERE id = ? AND customer_id = ?`)
    .get(sessionId, customerId);
  if (!row) throw new Error("Session not found");

  db.prepare(
    `UPDATE install_sessions SET status = 'completed', completed_at = datetime('now') WHERE id = ?`
  ).run(sessionId);

  return getInstallSession(sessionId)!;
}

export function listInstallSessions(customerId: string, limit = 50): InstallSession[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, customer_id, site_id, installer_user_id, mode, started_at, completed_at, status
       FROM install_sessions WHERE customer_id = ? ORDER BY started_at DESC LIMIT ?`
    )
    .all(customerId, limit) as Array<{
    id: string;
    customer_id: string;
    site_id: string | null;
    installer_user_id: string | null;
    mode: InstallSessionMode;
    started_at: string;
    completed_at: string | null;
    status: InstallSessionStatus;
  }>;

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

function getInstallSession(id: string): InstallSession | null {
  const r = getDatabase()
    .prepare(
      `SELECT id, customer_id, site_id, installer_user_id, mode, started_at, completed_at, status
       FROM install_sessions WHERE id = ?`
    )
    .get(id) as
    | {
        id: string;
        customer_id: string;
        site_id: string | null;
        installer_user_id: string | null;
        mode: InstallSessionMode;
        started_at: string;
        completed_at: string | null;
        status: InstallSessionStatus;
      }
    | undefined;
  if (!r) return null;
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

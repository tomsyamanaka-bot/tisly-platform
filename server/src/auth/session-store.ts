import { getDatabase } from "../db/database.js";
import { config } from "../config.js";

export interface AdminSessionRecord {
  id: string;
  userId: string;
  expiresAt: string;
  revokedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export function createSession(opts: {
  userId: string;
  tokenId: string;
  ipAddress?: string;
  userAgent?: string;
}): AdminSessionRecord {
  const db = getDatabase();
  const expiresAt = new Date(
    Date.now() + config.auth.sessionExpiresMinutes * 60 * 1000
  ).toISOString();
  db.prepare(
    `INSERT INTO admin_sessions (id, user_id, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?)`
  ).run(opts.tokenId, opts.userId, expiresAt, opts.ipAddress ?? null, opts.userAgent ?? null);
  return {
    id: opts.tokenId,
    userId: opts.userId,
    expiresAt,
    revokedAt: null,
    ipAddress: opts.ipAddress ?? null,
    userAgent: opts.userAgent ?? null,
    createdAt: new Date().toISOString(),
  };
}

export function revokeSession(sessionId: string): boolean {
  const db = getDatabase();
  const result = db
    .prepare(
      `UPDATE admin_sessions SET revoked_at = datetime('now')
       WHERE id = ? AND revoked_at IS NULL`
    )
    .run(sessionId);
  return result.changes > 0;
}

export function revokeSessionByTokenId(tokenId: string | undefined): boolean {
  if (!tokenId) return false;
  return revokeSession(tokenId);
}

export function isSessionRevoked(tokenId: string | undefined): boolean {
  if (!tokenId) return false;
  const row = getDatabase()
    .prepare(`SELECT revoked_at, expires_at FROM admin_sessions WHERE id = ?`)
    .get(tokenId) as { revoked_at: string | null; expires_at: string } | undefined;
  if (!row) return false;
  if (row.revoked_at) return true;
  if (new Date(row.expires_at).getTime() < Date.now()) return true;
  return false;
}

export function listActiveSessions(userId?: string): AdminSessionRecord[] {
  const db = getDatabase();
  const now = new Date().toISOString();
  const rows = userId
    ? (db
        .prepare(
          `SELECT id, user_id, expires_at, revoked_at, ip_address, user_agent, created_at
           FROM admin_sessions
           WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
           ORDER BY created_at DESC`
        )
        .all(userId, now) as Array<Record<string, unknown>>)
    : (db
        .prepare(
          `SELECT id, user_id, expires_at, revoked_at, ip_address, user_agent, created_at
           FROM admin_sessions
           WHERE revoked_at IS NULL AND expires_at > ?
           ORDER BY created_at DESC`
        )
        .all(now) as Array<Record<string, unknown>>);

  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    expiresAt: String(r.expires_at),
    revokedAt: r.revoked_at ? String(r.revoked_at) : null,
    ipAddress: r.ip_address ? String(r.ip_address) : null,
    userAgent: r.user_agent ? String(r.user_agent) : null,
    createdAt: String(r.created_at),
  }));
}

export function getSessionStoreStatus(): { active: number; provider: string } {
  const count = (
    getDatabase()
      .prepare(
        `SELECT COUNT(*) as c FROM admin_sessions
         WHERE revoked_at IS NULL AND expires_at > datetime('now')`
      )
      .get() as { c: number }
  ).c;
  return { active: count, provider: "sqlite" };
}

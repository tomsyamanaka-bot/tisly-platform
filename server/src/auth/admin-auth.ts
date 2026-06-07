import { v4 as uuid } from "uuid";
import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { logAudit } from "../provisioning/audit-log.js";
import { signToken, verifyToken } from "./jwt.js";
import { isValidScryptPasswordHash, verifyPassword } from "./password.js";
import { createSession, revokeSessionByTokenId } from "./session-store.js";
import { siemFromAudit } from "../security/siem-exporter.js";
import {
  isTotpEnabled,
  verifyTotpCode,
  adminRequires2fa,
} from "./totp.js";

export interface AdminSession {
  userId: string;
  username: string;
  role: string;
  token: string;
  tokenId?: string;
}

export function isAuthConfigured(): boolean {
  return Boolean(config.auth.jwtSecret);
}

export function isAdminPasswordConfigured(): boolean {
  return Boolean(
    config.auth.jwtSecret && isValidScryptPasswordHash(config.auth.adminPasswordHash)
  );
}

export function loginAdmin(
  username: string,
  password: string,
  meta?: { ip?: string; userAgent?: string; totpCode?: string }
): AdminSession | null {
  if (!isAdminPasswordConfigured()) return null;
  if (username !== config.auth.adminUsername) return null;
  if (!verifyPassword(password, config.auth.adminPasswordHash)) {
    recordFailedLogin(username, meta);
    return null;
  }
  const userId = "admin-default";
  const needsTotp = isTotpEnabled(userId) || adminRequires2fa(userId);
  if (needsTotp) {
    if (!meta?.totpCode || !verifyTotpCode(userId, meta.totpCode)) {
      recordFailedLogin(username, meta);
      return null;
    }
  }
  clearFailedLogins(username);
  const { token, jti } = signToken({ sub: userId, username, role: "super_admin", scope: "platform" });
  createSession({
    userId,
    tokenId: jti,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });
  logAudit({
    userId,
    actorLabel: username,
    action: "auth.login",
    targetType: "user",
    targetId: userId,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
    details: { success: true },
  });
  siemFromAudit({
    action: "auth.login",
    userId,
    sourceIp: meta?.ip,
    message: `Admin login: ${username}`,
  });
  return { userId, username, role: "super_admin", token, tokenId: jti };
}

export function resolveSession(token: string | undefined): AdminSession | null {
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return {
    userId: payload.sub,
    username: payload.username,
    role: payload.role,
    token,
    tokenId: payload.jti,
  };
}

export function recordFailedLogin(
  username: string,
  meta?: { ip?: string; userAgent?: string }
): void {
  const db = getDatabase();
  const id = `failed-login:${username}`;
  const row = db
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get(id) as { value_json: string } | undefined;
  const prev = row ? (JSON.parse(row.value_json) as { count: number }) : { count: 0 };
  const next = { count: prev.count + 1, lastAt: new Date().toISOString(), ip: meta?.ip };
  db.prepare(
    `INSERT INTO platform_settings (key, value_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
  ).run(id, JSON.stringify(next));
}

export function clearFailedLogins(username: string): void {
  getDatabase()
    .prepare("DELETE FROM platform_settings WHERE key = ?")
    .run(`failed-login:${username}`);
}

export function getFailedLoginCount(username?: string): number {
  const key = `failed-login:${username ?? config.auth.adminUsername}`;
  const row = getDatabase()
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get(key) as { value_json: string } | undefined;
  if (!row) return 0;
  return (JSON.parse(row.value_json) as { count: number }).count ?? 0;
}

export function recordIngestError(deviceId?: string): void {
  const db = getDatabase();
  const key = "security:ingest-errors";
  const row = db.prepare("SELECT value_json FROM platform_settings WHERE key = ?").get(key) as
    | { value_json: string }
    | undefined;
  const prev = row
    ? (JSON.parse(row.value_json) as { count: number; lastDeviceId?: string })
    : { count: 0 };
  db.prepare(
    `INSERT INTO platform_settings (key, value_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
  ).run(
    key,
    JSON.stringify({
      count: prev.count + 1,
      lastAt: new Date().toISOString(),
      lastDeviceId: deviceId ?? prev.lastDeviceId,
    })
  );
}

export function getIngestErrorCount(): number {
  const row = getDatabase()
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("security:ingest-errors") as { value_json: string } | undefined;
  if (!row) return 0;
  return (JSON.parse(row.value_json) as { count: number }).count ?? 0;
}

export function logoutAdmin(
  userId: string,
  meta?: { ip?: string; userAgent?: string; tokenId?: string }
): void {
  revokeSessionByTokenId(meta?.tokenId);
  logAudit({
    userId,
    action: "auth.logout",
    targetType: "user",
    targetId: userId,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });
}

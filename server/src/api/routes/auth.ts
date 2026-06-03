import { Router } from "express";
import {
  getFailedLoginCount,
  isAuthConfigured,
  loginAdmin,
  logoutAdmin,
  resolveSession,
} from "../../auth/admin-auth.js";
import { requireAdminAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { createRateLimit } from "../../security/rate-limit-redis.js";
import {
  listActiveSessions,
  revokeSession,
} from "../../auth/session-store.js";
import {
  setupTotp,
  verifyTotp,
  enableTotp,
  disableTotp,
  isTotpEnabled,
} from "../../auth/totp.js";
import { logAudit } from "../../provisioning/audit-log.js";

export const authRouter = Router();

const loginLimiter = createRateLimit({
  keyPrefix: "auth-login",
  max: 10,
  windowMs: 15 * 60 * 1000,
});

authRouter.post("/login", loginLimiter, (req, res) => {
  if (!isAuthConfigured()) {
    res.status(503).json({
      error: "Admin authentication not configured",
      hint: "Set JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD_HASH",
    });
    return;
  }
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: "username and password required" });
    return;
  }
  const session = loginAdmin(username, password, {
    ip: req.ip,
    userAgent: req.header("user-agent") ?? undefined,
  });
  if (!session) {
    res.status(401).json({
      error: "Invalid credentials",
      failedAttempts: getFailedLoginCount(username),
    });
    return;
  }
  res.json({
    ok: true,
    token: session.token,
    user: {
      id: session.userId,
      username: session.username,
      role: session.role,
    },
    expiresInMinutes: Number(process.env.SESSION_EXPIRES_MINUTES ?? 480),
  });
});

authRouter.post("/logout", requireAdminAuth, (req: AuthedRequest, res) => {
  if (req.admin) {
    logoutAdmin(req.admin.userId, {
      ip: req.ip,
      userAgent: req.header("user-agent") ?? undefined,
      tokenId: req.admin.tokenId,
    });
  }
  res.json({ ok: true });
});

authRouter.get("/me", requireAdminAuth, (req: AuthedRequest, res) => {
  res.json({
    ok: true,
    user: req.admin,
    authConfigured: isAuthConfigured(),
    totpEnabled: req.admin ? isTotpEnabled(req.admin.userId) : false,
  });
});

authRouter.get("/status", (_req, res) => {
  res.json({
    configured: isAuthConfigured(),
    failedLoginCount: getFailedLoginCount(),
  });
});

authRouter.get("/sessions", requireAdminAuth, (req: AuthedRequest, res) => {
  const sessions = listActiveSessions(req.admin?.userId);
  res.json({ sessions });
});

authRouter.post("/sessions/:id/revoke", requireAdminAuth, (req: AuthedRequest, res) => {
  const sessionId = String(req.params.id);
  const ok = revokeSession(sessionId);
  if (!ok) {
    res.status(404).json({ error: "Session not found or already revoked" });
    return;
  }
  logAudit({
    userId: req.admin?.userId,
    actorLabel: req.admin?.username,
    action: "auth.session_revoke",
    targetType: "session",
    targetId: sessionId,
    ipAddress: req.ip,
    userAgent: req.header("user-agent") ?? undefined,
  });
  res.json({ ok: true, revoked: sessionId });
});

authRouter.post("/2fa/setup", requireAdminAuth, (req: AuthedRequest, res) => {
  if (!req.admin) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const result = setupTotp(req.admin.userId);
  res.json({ ok: true, ...result, note: "Mock TOTP — use code 000000 to verify in PoC" });
});

authRouter.post("/2fa/verify", requireAdminAuth, (req: AuthedRequest, res) => {
  const code = (req.body as { code?: string }).code;
  if (!req.admin || !code) {
    res.status(400).json({ error: "code required" });
    return;
  }
  const ok = enableTotp(req.admin.userId, code);
  if (!ok) {
    res.status(401).json({ error: "Invalid TOTP code" });
    return;
  }
  res.json({ ok: true, enabled: true });
});

authRouter.post("/2fa/disable", requireAdminAuth, (req: AuthedRequest, res) => {
  if (!req.admin) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  disableTotp(req.admin.userId);
  res.json({ ok: true, enabled: false });
});

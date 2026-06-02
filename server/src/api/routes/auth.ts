import { Router } from "express";
import {
  getFailedLoginCount,
  isAuthConfigured,
  loginAdmin,
  logoutAdmin,
  resolveSession,
} from "../../auth/admin-auth.js";
import { requireAdminAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { rateLimit } from "../../security/rate-limit.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
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
    });
  }
  res.json({ ok: true });
});

authRouter.get("/me", requireAdminAuth, (req: AuthedRequest, res) => {
  res.json({
    ok: true,
    user: req.admin,
    authConfigured: isAuthConfigured(),
  });
});

authRouter.get("/status", (_req, res) => {
  res.json({
    configured: isAuthConfigured(),
    failedLoginCount: getFailedLoginCount(),
  });
});

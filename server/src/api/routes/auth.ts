import { Router } from "express";
import {
  getFailedLoginCount,
  isAuthConfigured,
  loginAdmin,
  logoutAdmin,
} from "../../auth/admin-auth.js";
import { loginCustomer, loginTesterDemoUnconditionalV1 } from "../../auth/customer-auth.js";
import {
  getCustomerFailedLoginCount,
  isCustomerUserLocked,
} from "../../auth/customer-login-security.js";
import { getDatabase } from "../../db/database.js";
import { getCustomerByCode, customerUrls } from "../../customer/customer-store.js";
import { requireAdminAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { createRateLimit } from "../../security/rate-limit-redis.js";
import { rateLimit as memoryRateLimit } from "../../security/rate-limit.js";
import {
  listActiveSessions,
  revokeSession,
} from "../../auth/session-store.js";
import {
  setupTotp,
  verifyTotpCode,
  enableTotp,
  disableTotp,
  isTotpEnabled,
  isRequire2fa,
} from "../../auth/totp.js";
import { logAudit } from "../../provisioning/audit-log.js";
import { config } from "../../config.js";
import { ensureTester001CustomerV1 } from "../../customer/seed-tester001-v1.js";
import {
  isTesterDemoPasswordV1,
  isTesterTenantV1,
  TESTER_CUSTOMER_CODE_V1,
  TESTER_DISPLAY_NAME_V1,
  TESTER_HOME_SITE_ID_V1,
  TESTER_PORTAL_MODULE_LABELS_V1,
  TESTER_USERNAME_V1,
} from "../../shared/customer/tester-tenant-v1.js";
import { normalizeCustomerTenantCodeV1 } from "../../shared/customer/customer-tenant-profile-v1.js";

export const authRouter = Router();

function buildLoginLimiter() {
  return process.env.NODE_ENV === "test"
    ? memoryRateLimit({
        keyPrefix: "auth-login",
        max: Number(process.env.TEST_LOGIN_RATE_MAX ?? 1000),
        windowMs: 15 * 60 * 1000,
      })
    : createRateLimit({
        keyPrefix: "auth-login",
        max: 10,
        windowMs: 15 * 60 * 1000,
      });
}

let loginLimiter = buildLoginLimiter();

export function resetLoginLimiterForTests(): void {
  loginLimiter = buildLoginLimiter();
}

function applyLoginLimiter(
  req: Parameters<ReturnType<typeof buildLoginLimiter>>[0],
  res: Parameters<ReturnType<typeof buildLoginLimiter>>[1],
  next: Parameters<ReturnType<typeof buildLoginLimiter>>[2]
): void {
  loginLimiter(req, res, next);
}

const AUTH_NO_STORE =
  "no-store, no-cache, must-revalidate";

function setAuthNoStoreHeaders(
  res: Parameters<ReturnType<typeof buildLoginLimiter>>[1]
): void {
  res.setHeader("Cache-Control", AUTH_NO_STORE);
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function testerLoginPayloadV1(session: {
  token: string;
  userId: string;
  username: string;
  role: string;
  customerId: string;
  customerCode: string;
}) {
  return {
    ok: true,
    success: true,
    tenantId: TESTER_CUSTOMER_CODE_V1,
    userName: TESTER_USERNAME_V1,
    siteId: TESTER_HOME_SITE_ID_V1,
    displayName: TESTER_DISPLAY_NAME_V1,
    modules: [...TESTER_PORTAL_MODULE_LABELS_V1],
    hardwareMock: true,
    token: session.token,
    user: {
      id: session.userId,
      username: session.username,
      role: session.role,
      customerId: session.customerId,
      customerCode: TESTER_CUSTOMER_CODE_V1,
    },
    scope: "customer",
    urls: customerUrls(TESTER_CUSTOMER_CODE_V1),
    expiresInMinutes: Number(process.env.SESSION_EXPIRES_MINUTES ?? 480),
  };
}

function handleCustomerLogin(
  req: Parameters<ReturnType<typeof buildLoginLimiter>>[0],
  res: Parameters<ReturnType<typeof buildLoginLimiter>>[1]
): void {
  setAuthNoStoreHeaders(res);
  if (!config.auth.jwtSecret) {
    res.status(503).json({ error: "Authentication not configured — set JWT_SECRET" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const customerCode = normalizeCustomerTenantCodeV1(
    String(
      body.customerCode ??
        body.customer_code ??
        body.tenantId ??
        body.tenant_id ??
        ""
    )
  );
  const username = String(body.username ?? body.user ?? "").trim();
  const password = String(body.password ?? "");
  const testerDemo =
    isTesterTenantV1(customerCode) && isTesterDemoPasswordV1(password);
  if (!customerCode || !password || (!username && !testerDemo)) {
    res.status(400).json({ error: "customerCode, username, password required" });
    return;
  }

  if (testerDemo) {
    const session = loginTesterDemoUnconditionalV1(
      username || TESTER_USERNAME_V1,
      password,
      {
        ip: req.ip,
        userAgent: req.header("user-agent") ?? undefined,
      }
    );
    if (session) {
      res.status(200).json(testerLoginPayloadV1(session));
      return;
    }
    res.status(200).json({
      ok: true,
      success: true,
      tenantId: TESTER_CUSTOMER_CODE_V1,
      userName: TESTER_USERNAME_V1,
      siteId: TESTER_HOME_SITE_ID_V1,
      displayName: TESTER_DISPLAY_NAME_V1,
      modules: [...TESTER_PORTAL_MODULE_LABELS_V1],
      hardwareMock: true,
    });
    return;
  }

  if (isTesterTenantV1(customerCode)) {
    try {
      ensureTester001CustomerV1();
    } catch {
      /* 通常経路でもシードは試みる */
    }
  }
  const customer = getCustomerByCode(customerCode);
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const userRow = getDatabase()
    .prepare(
      `SELECT id FROM customer_users
       WHERE customer_id = ? AND username = ? COLLATE NOCASE AND status = 'active'`
    )
    .get(customer.customer_id, username) as { id: string } | undefined;
  if (userRow && isCustomerUserLocked(userRow.id)) {
    res.status(423).json({
      error: "Account locked — too many failed attempts",
      lockMinutes: Number(process.env.CUSTOMER_LOGIN_LOCK_MINUTES ?? 15),
    });
    return;
  }

  const session = loginCustomer(customerCode, username, password, {
    ip: req.ip,
    userAgent: req.header("user-agent") ?? undefined,
  });
  if (!session) {
    res.status(401).json({
      error: "Invalid credentials",
      failedAttempts: userRow ? getCustomerFailedLoginCount(userRow.id) : 0,
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
      customerId: session.customerId,
      customerCode: session.customerCode,
    },
    scope: "customer",
    urls: customerUrls(customer.customer_code),
    hardwareMock: isTesterTenantV1(session.customerCode),
    expiresInMinutes: Number(process.env.SESSION_EXPIRES_MINUTES ?? 480),
  });
}

authRouter.post("/login", applyLoginLimiter, (req, res) => {
  setAuthNoStoreHeaders(res);
  if (!isAuthConfigured()) {
    res.status(503).json({
      error: "Admin authentication not configured",
      hint: "Set JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD_HASH",
    });
    return;
  }
  const { username, password, totpCode } = req.body as {
    username?: string;
    password?: string;
    totpCode?: string;
  };
  if (!username || !password) {
    res.status(400).json({ error: "username and password required" });
    return;
  }
  const session = loginAdmin(username, password, {
    ip: req.ip,
    userAgent: req.header("user-agent") ?? undefined,
    totpCode,
  });
  if (!session) {
    const needs2fa = isRequire2fa() || isTotpEnabled("admin-default");
    res.status(401).json({
      error: needs2fa && !totpCode ? "TOTP code required" : "Invalid credentials",
      failedAttempts: getFailedLoginCount(username),
      require2fa: isRequire2fa(),
      totpRequired: needs2fa,
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
    scope: "platform",
    expiresInMinutes: Number(process.env.SESSION_EXPIRES_MINUTES ?? 480),
  });
});

authRouter.post("/customer/login", applyLoginLimiter, handleCustomerLogin);
authRouter.post("/customer-login", applyLoginLimiter, handleCustomerLogin);

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
    require2fa: isRequire2fa(),
  });
});

authRouter.get("/status", (_req, res) => {
  res.json({
    configured: isAuthConfigured(),
    failedLoginCount: getFailedLoginCount(),
    require2fa: isRequire2fa(),
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

authRouter.post("/2fa/setup", requireAdminAuth, async (req: AuthedRequest, res) => {
  if (!req.admin) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const result = await setupTotp(req.admin.userId);
  res.json({ ok: true, ...result });
});

authRouter.post("/2fa/verify", requireAdminAuth, (req: AuthedRequest, res) => {
  const code = (req.body as { code?: string }).code;
  if (!req.admin || !code) {
    res.status(400).json({ error: "code required" });
    return;
  }
  const ok = verifyTotpCode(req.admin.userId, code);
  if (!ok) {
    res.status(401).json({ error: "Invalid TOTP code" });
    return;
  }
  res.json({ ok: true, verified: true });
});

authRouter.post("/2fa/enable", requireAdminAuth, (req: AuthedRequest, res) => {
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
  const code = (req.body as { code?: string }).code;
  const ok = disableTotp(req.admin.userId, code);
  if (!ok) {
    res.status(401).json({ error: "Invalid TOTP code — required when 2FA is enabled" });
    return;
  }
  res.json({ ok: true, enabled: false });
});

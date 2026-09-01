import { Router, type Response } from "express";
import fs from "fs";
import {
  buildCustomerPortalLandingV1,
  buildCustomerHomeListViewV1,
  buildCustomerHomeByShareIdV1,
  buildCustomerProjectViewV1,
  buildCustomerDocumentViewV1,
  buildCustomerMonitoringViewV1,
  buildCustomerSessionHomeV1,
} from "../../shared/customer/customer-portal-data-v1.js";
import {
  buildCustomerAdminListV1,
  getCustomerPortalStatsV1,
  listCustomerNotificationsForHomeV1,
} from "../../shared/customer/customer-data-service-v1.js";
import { resolveCustomerPortalFileV1 } from "../../shared/customer/customer-files-v1.js";
import { decodeCustomerShareIdV1 } from "../../shared/customer/customer-share-id-v1.js";
import { sanitizeCustomerMonitoringApiV1 } from "../../shared/customer/customer-monitoring-state-v1.js";
import {
  CUSTOMER_PORTAL_PLANS_V1,
  patchCustomerMasterAdminV1,
  patchPropertyMasterAdminV1,
  uploadCustomerAdminFilesV1,
} from "../../shared/customer/customer-admin-api-v1.js";
import {
  TISLY_LEGACY_REDIRECTS_V1,
  TISLY_INTERNAL_ROUTES_V1,
  TISLY_CUSTOMER_ROUTES_V1,
} from "../../shared/routes/tisly-routes-v1.js";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import {
  resolveCustomerTenantProfileV1,
} from "../../shared/customer/customer-tenant-profile-v1.js";
import {
  addCustomerUserAdminV1,
  createCustomerAccountAdminV1,
  listCustomerAccountsAdminV1,
  listModuleCatalogAdminV1,
  resetCustomerUserPasswordAdminV1,
  updateCustomerAccountAdminV1,
} from "../../shared/customer/customer-account-admin-v1.js";
import { isInternalOpsCustomerV1 } from "../../tenant/customer-enabled-modules-v1.js";

export const customerPortalV1Router = Router();

customerPortalV1Router.get("/landing", (_req, res) => {
  res.json({ status: "ok", ...buildCustomerPortalLandingV1() });
});

/** ログイン済みセッションからホーム画面（/customer 固定 URL 用） */
customerPortalV1Router.get(
  "/session-home",
  requireAuth("viewer"),
  (req: AuthedRequest, res) => {
    const code = String(req.admin?.customerCode ?? "").trim().toUpperCase();
    if (!code) {
      res.status(401).json({ status: "error", error: "ログインが必要です" });
      return;
    }
    const profile = resolveCustomerTenantProfileV1(code);
    const home = buildCustomerSessionHomeV1(code);
    res.json({
      status: "ok",
      customerCode: code,
      tenantProfile: profile,
      home,
    });
  }
);

/** テナント別 Security / HOME 物件 ID */
customerPortalV1Router.get(
  "/tenant-profile",
  requireAuth("viewer"),
  (req: AuthedRequest, res) => {
    const code = String(req.admin?.customerCode ?? "").trim().toUpperCase();
    const profile = resolveCustomerTenantProfileV1(code);
    if (!profile) {
      res.status(404).json({
        status: "error",
        error: "テナントプロファイルが見つかりません",
      });
      return;
    }
    res.json({ status: "ok", profile });
  }
);

customerPortalV1Router.get("/home/:customerCode", (req, res) => {
  const data = buildCustomerHomeListViewV1(String(req.params.customerCode));
  res.json({ status: "ok", ...data });
});

customerPortalV1Router.get("/home-by-share/:shareId", (req, res) => {
  const data = buildCustomerHomeByShareIdV1(String(req.params.shareId));
  if (!data) {
    res.status(404).json({ status: "error", error: "物件が見つかりません" });
    return;
  }
  res.json({ status: "ok", ...data });
});

customerPortalV1Router.get("/project/:shareId", (req, res) => {
  const data = buildCustomerProjectViewV1(String(req.params.shareId));
  if (!data) {
    res.status(404).json({ status: "error", error: "案件が見つかりません" });
    return;
  }
  res.json({ status: "ok", ...data });
});

customerPortalV1Router.get("/document/:shareId", (req, res) => {
  const fileId = typeof req.query.fileId === "string" ? req.query.fileId : undefined;
  const docType = typeof req.query.docType === "string" ? req.query.docType : undefined;
  const data = buildCustomerDocumentViewV1(String(req.params.shareId), { fileId, docType });
  if (!data) {
    res.status(404).json({ status: "error", error: "資料が見つかりません" });
    return;
  }
  res.json({ status: "ok", ...data });
});

customerPortalV1Router.get("/monitoring/:shareId", (req, res) => {
  const data = buildCustomerMonitoringViewV1(String(req.params.shareId));
  if (!data) {
    res.status(404).json({ status: "error", error: "監視画面が見つかりません" });
    return;
  }
  res.json({ status: "ok", ...sanitizeCustomerMonitoringApiV1(data) });
});

customerPortalV1Router.get("/file/:shareId/:fileId", (req, res) => {
  const shareId = String(req.params.shareId);
  const fileId = String(req.params.fileId);
  const ref = decodeCustomerShareIdV1(shareId);
  const resolved = resolveCustomerPortalFileV1(ref, fileId);
  if (!resolved) {
    res.status(404).json({ status: "error", error: "資料が見つかりません" });
    return;
  }
  res.setHeader("Content-Type", resolved.contentType);
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(resolved.downloadName)}"`
  );
  const stream = fs.createReadStream(resolved.absolutePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(404).json({ status: "error", error: "資料が見つかりません" });
      return;
    }
    res.end();
  });
  stream.pipe(res);
});

customerPortalV1Router.get("/stats", (_req, res) => {
  const stats = getCustomerPortalStatsV1();
  res.json({ status: stats.apiStatus, ...stats });
});

customerPortalV1Router.get("/notifications/:customerCode", (req, res) => {
  const code = String(req.params.customerCode);
  const items = listCustomerNotificationsForHomeV1(code);
  res.json({ status: "ok", notifications: items });
});

customerPortalV1Router.get("/admin/list", (req, res) => {
  const customerCode =
    typeof req.query.customerCode === "string" ? req.query.customerCode : undefined;
  const propertyQuery =
    typeof req.query.propertyQuery === "string" ? req.query.propertyQuery : undefined;
  const customers = buildCustomerAdminListV1({ customerCode, propertyQuery });
  const stats = getCustomerPortalStatsV1();
  res.json({
    status: "ok",
    stats,
    customers,
    masters: customers.reduce(
      (acc, row) => {
        if (!acc.some((m) => m.customerCode === row.customerCode)) {
          acc.push({ customerCode: row.customerCode, customerName: row.customerName });
        }
        return acc;
      },
      [] as Array<{ customerCode: string; customerName: string }>
    ),
  });
});

customerPortalV1Router.get("/admin/plans", (_req, res) => {
  res.json({ status: "ok", plans: CUSTOMER_PORTAL_PLANS_V1 });
});

customerPortalV1Router.patch("/admin/customer/:customerCode", (req, res) => {
  try {
    const updated = patchCustomerMasterAdminV1({
      customerCode: String(req.params.customerCode),
      ...req.body,
    });
    res.json({ status: "ok", customer: updated });
  } catch (e) {
    res.status(400).json({ status: "error", error: (e as Error).message });
  }
});

customerPortalV1Router.patch("/admin/property/:propertyId", (req, res) => {
  try {
    const updated = patchPropertyMasterAdminV1({
      propertyId: String(req.params.propertyId),
      ...req.body,
    });
    res.json({ status: "ok", property: updated });
  } catch (e) {
    res.status(400).json({ status: "error", error: (e as Error).message });
  }
});

customerPortalV1Router.post("/admin/upload", (req, res) => {
  try {
    const body = req.body ?? {};
    const filesRaw = Array.isArray(body.files) ? body.files : body.fileBase64 ? [body] : [];
    const files = filesRaw.map((f: { fileName?: string; fileBase64?: string }) => ({
      fileName: String(f.fileName ?? "upload.bin"),
      buffer: Buffer.from(String(f.fileBase64 ?? ""), "base64"),
    }));
    if (!files.length || files.some((f: { buffer: Buffer }) => !f.buffer.length)) {
      res.status(400).json({ status: "error", error: "files or fileBase64 required" });
      return;
    }
    const saved = uploadCustomerAdminFilesV1({
      customerCode: String(body.customerCode ?? ""),
      propertyId: String(body.propertyId ?? ""),
      projectRef: body.projectRef != null ? String(body.projectRef) : null,
      fileType: String(body.fileType ?? "photo"),
      files,
    });
    res.json({ status: "ok", saved });
  } catch (e) {
    res.status(400).json({ status: "error", error: (e as Error).message });
  }
});

/** 社内 Customer Master — 権限チェック */
function assertInternalOpsAdmin(
  req: AuthedRequest,
  res: Response
): boolean {
  const self = String(req.admin?.customerCode ?? "").toUpperCase();
  if (!isInternalOpsCustomerV1(self)) {
    res.status(403).json({
      status: "error",
      error: "社内管理者のみ利用できます",
    });
    return false;
  }
  const role = req.admin?.role ?? "viewer";
  if (!["admin", "super_admin", "owner"].includes(role)) {
    res.status(403).json({
      status: "error",
      error: "管理者権限が必要です",
    });
    return false;
  }
  return true;
}

customerPortalV1Router.get(
  "/admin/accounts",
  requireAuth("admin"),
  (req: AuthedRequest, res) => {
    if (!assertInternalOpsAdmin(req, res)) return;
    const q = String(req.query.customerCode ?? "").trim();
    res.json({
      status: "ok",
      accounts: listCustomerAccountsAdminV1(
        q ? { customerCode: q } : undefined
      ),
    });
  }
);

customerPortalV1Router.get(
  "/admin/accounts/modules",
  requireAuth("admin"),
  (req: AuthedRequest, res) => {
    if (!assertInternalOpsAdmin(req, res)) return;
    res.json({
      status: "ok",
      modules: listModuleCatalogAdminV1(),
    });
  }
);

customerPortalV1Router.post(
  "/admin/accounts",
  requireAuth("admin"),
  (req: AuthedRequest, res) => {
    if (!assertInternalOpsAdmin(req, res)) return;
    try {
      const body = req.body ?? {};
      const row = createCustomerAccountAdminV1({
        customerCode: String(body.customerCode ?? ""),
        customerName: String(body.customerName ?? ""),
        username: String(body.username ?? ""),
        password: String(body.password ?? ""),
        plan: body.plan,
        enabledModules: body.enabledModules,
        bindings: body.bindings,
        actorLabel: req.admin?.username ?? "customer-master-v1",
      });
      res.status(201).json({ status: "ok", account: row });
    } catch (e) {
      res.status(400).json({ status: "error", error: (e as Error).message });
    }
  }
);

customerPortalV1Router.patch(
  "/admin/accounts/:customerCode",
  requireAuth("admin"),
  (req: AuthedRequest, res) => {
    if (!assertInternalOpsAdmin(req, res)) return;
    try {
      const body = req.body ?? {};
      const row = updateCustomerAccountAdminV1({
        customerCode: String(req.params.customerCode),
        customerName: body.customerName,
        plan: body.plan,
        enabledModules: body.enabledModules,
        bindings: body.bindings,
        actorLabel: req.admin?.username ?? "customer-master-v1",
      });
      res.json({ status: "ok", account: row });
    } catch (e) {
      res.status(400).json({ status: "error", error: (e as Error).message });
    }
  }
);

customerPortalV1Router.post(
  "/admin/accounts/:customerCode/password",
  requireAuth("admin"),
  (req: AuthedRequest, res) => {
    if (!assertInternalOpsAdmin(req, res)) return;
    try {
      const body = req.body ?? {};
      const result = resetCustomerUserPasswordAdminV1({
        customerCode: String(req.params.customerCode),
        username: String(body.username ?? ""),
        password: String(body.password ?? ""),
      });
      res.json({ status: "ok", ...result });
    } catch (e) {
      res.status(400).json({ status: "error", error: (e as Error).message });
    }
  }
);

customerPortalV1Router.post(
  "/admin/accounts/:customerCode/users",
  requireAuth("admin"),
  (req: AuthedRequest, res) => {
    if (!assertInternalOpsAdmin(req, res)) return;
    try {
      const body = req.body ?? {};
      const user = addCustomerUserAdminV1({
        customerCode: String(req.params.customerCode),
        username: String(body.username ?? ""),
        password: String(body.password ?? ""),
        role: body.role,
      });
      res.status(201).json({ status: "ok", user });
    } catch (e) {
      res.status(400).json({ status: "error", error: (e as Error).message });
    }
  }
);

customerPortalV1Router.get("/route-contract", (_req, res) => {
  res.json({
    status: "ok",
    internalRoutes: TISLY_INTERNAL_ROUTES_V1,
    customerRoutes: TISLY_CUSTOMER_ROUTES_V1,
    legacyRedirects: TISLY_LEGACY_REDIRECTS_V1,
    separation: {
      internalPrefix: "/app",
      customerPrefix: "/customer",
      crossNavigationBlocked: true,
    },
  });
});

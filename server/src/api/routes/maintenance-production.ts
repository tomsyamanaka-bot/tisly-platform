import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { requireTenantMatch } from "../../auth/tenant-guard.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { getCustomerByCode } from "../../customer/customer-store.js";
import { canAccessCustomer } from "../../auth/customer-auth.js";
import {
  createMaintenanceCase,
  listMaintenanceCases,
  getMaintenanceCase,
  updateMaintenanceCase,
  deleteMaintenanceCase,
  listRecoveryHistoryForCustomer,
} from "../../maintenance/maintenance-store.js";
import { listShellyDevices, rebootShellyDevice } from "../../maintenance/shelly-manager.js";
import { createMaintenanceFromSurvey } from "../../survey/survey-maintenance-bridge.js";

export const maintenanceProductionRouter = Router();

const maintAuth = [requireAuth("maintenance")] as const;

function assertMaintenanceRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "maintenance")) {
    res.status(403).json({ error: "Maintenance role or higher required" });
    return false;
  }
  return true;
}

function resolveCustomerCode(req: AuthedRequest, code: string) {
  const customer = getCustomerByCode(code);
  if (!customer) return null;
  if (req.admin && !canAccessCustomer(req.admin, customer.customer_id)) return null;
  return customer;
}

maintenanceProductionRouter.post(
  "/from-survey/:projectId",
  ...maintAuth,
  (req: AuthedRequest, res) => {
    if (!assertMaintenanceRole(req, res)) return;
    try {
      const result = createMaintenanceFromSurvey(String(req.params.projectId));
      res.status(201).json(result);
    } catch (e) {
      res.status(404).json({ error: String(e) });
    }
  }
);

maintenanceProductionRouter.get("/cases", ...maintAuth, (req: AuthedRequest, res) => {
  if (!assertMaintenanceRole(req, res)) return;
  const customerCode = req.query.customerCode as string | undefined;
  res.json({ cases: listMaintenanceCases(customerCode) });
});

maintenanceProductionRouter.post("/cases", ...maintAuth, (req: AuthedRequest, res) => {
  if (!assertMaintenanceRole(req, res)) return;
  const body = req.body as {
    customerCode?: string;
    siteId?: string;
    siteName?: string;
    deviceIds?: string[];
    notes?: string;
  };
  if (!body.customerCode) {
    res.status(400).json({ error: "customerCode required" });
    return;
  }
  const c = createMaintenanceCase({
    customerCode: body.customerCode,
    siteId: body.siteId,
    siteName: body.siteName,
    deviceIds: body.deviceIds,
    notes: body.notes,
  });
  res.status(201).json(c);
});

maintenanceProductionRouter.get("/cases/:caseId", ...maintAuth, (req: AuthedRequest, res) => {
  if (!assertMaintenanceRole(req, res)) return;
  const c = getMaintenanceCase(String(req.params.caseId));
  if (!c) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(c);
});

maintenanceProductionRouter.patch("/cases/:caseId", ...maintAuth, (req: AuthedRequest, res) => {
  if (!assertMaintenanceRole(req, res)) return;
  const updated = updateMaintenanceCase(String(req.params.caseId), req.body);
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

maintenanceProductionRouter.delete("/cases/:caseId", ...maintAuth, (req: AuthedRequest, res) => {
  if (!assertMaintenanceRole(req, res)) return;
  if (!deleteMaintenanceCase(String(req.params.caseId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

maintenanceProductionRouter.get(
  "/recovery-history/:customerCode",
  ...maintAuth,
  requireTenantMatch("customerCode"),
  (req: AuthedRequest, res) => {
    if (!assertMaintenanceRole(req, res)) return;
    const customer = resolveCustomerCode(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const limit = Number(req.query.limit ?? 50);
    res.json({ entries: listRecoveryHistoryForCustomer(customer.customer_code, limit) });
  }
);

maintenanceProductionRouter.get(
  "/shelly/:customerCode",
  ...maintAuth,
  requireTenantMatch("customerCode"),
  (req: AuthedRequest, res) => {
    if (!assertMaintenanceRole(req, res)) return;
    const customer = resolveCustomerCode(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    res.json({ devices: listShellyDevices(customer.customer_code) });
  }
);

maintenanceProductionRouter.post(
  "/shelly/:customerCode/:deviceId/reboot",
  ...maintAuth,
  requireTenantMatch("customerCode"),
  (req: AuthedRequest, res) => {
    if (!assertMaintenanceRole(req, res)) return;
    const customer = resolveCustomerCode(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    try {
      const result = rebootShellyDevice(String(req.params.deviceId), req.admin?.username);
      res.json(result);
    } catch (e) {
      res.status(404).json({ error: String(e) });
    }
  }
);

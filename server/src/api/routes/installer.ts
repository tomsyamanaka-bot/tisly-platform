import { Router, type Response } from "express";
import { getDatabase } from "../../db/database.js";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { requireTenantMatch } from "../../auth/tenant-guard.js";
import { canAccessCustomer } from "../../auth/customer-auth.js";
import { canViewBilling } from "../../auth/roles.js";
import { getCustomerByCode } from "../../customer/customer-store.js";
import { requirePlanFeature } from "../../customer/plan-guard.js";
import { createRateLimit } from "../../security/rate-limit-redis.js";
import { auditContextFromRequest, logAudit } from "../../provisioning/audit-log.js";
import { createQrProvisioning, claimQrProvisioning } from "../../provisioning/qr-provisioning.js";
import { claimNfcProvisioning } from "../../provisioning/nfc-provisioning.js";
import { listDeviceTemplates } from "../../provisioning/device-templates.js";
import {
  getCustomerInstallChecklist,
  completeChecklistItem,
  type ChecklistItemId,
} from "../../installer/install-checklist.js";
import {
  runDeviceConnectivityTest,
  getMqttDiagnostic,
  type DeviceTestKind,
} from "../../installer/device-connectivity-test.js";
import { buildInstallCompletionReportHtml } from "../../installer/completion-report.js";
import { getDeviceLabelData } from "../../installer/device-label.js";
import { archiveFloorplanToQnap } from "../../qnap/floorplan-archive.js";
import { getFloorById } from "../../site-builder/floor-store.js";

export const customerInstallerRouter = Router();

const provisionRateLimit = createRateLimit({
  windowMs: 60_000,
  max: 30,
  keyPrefix: "installer-provision",
});

const installAuth = [requireAuth("installer"), requireTenantMatch("customerCode")] as const;
const portalViewAuth = [requireAuth("viewer"), requireTenantMatch("customerCode")] as const;

function resolveCustomer(req: AuthedRequest, code: string) {
  const customer = getCustomerByCode(code);
  if (!customer) return null;
  if (req.admin && !canAccessCustomer(req.admin, customer.customer_id)) return null;
  return customer;
}

customerInstallerRouter.post(
  "/:customerCode/devices/qr/create",
  ...installAuth,
  provisionRateLimit,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    if (!requirePlanFeature(customer.plan, "customer_portal", res)) return;
    const { deviceId, deviceType, serialNumber, ttlMinutes } = req.body as {
      deviceId?: string;
      deviceType?: string;
      serialNumber?: string;
      ttlMinutes?: number;
    };
    if (!deviceId || !deviceType || !serialNumber) {
      res.status(400).json({ error: "deviceId, deviceType, serialNumber required" });
      return;
    }
    try {
      const result = createQrProvisioning({
        customerId: customer.customer_id,
        deviceId,
        deviceType,
        serialNumber,
        createdBy: req.admin?.userId,
        ttlMinutes,
      });
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: "installer.qr.create",
        entityType: "device",
        entityId: deviceId,
      });
      res.status(201).json(result);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.post(
  "/:customerCode/devices/qr/claim",
  ...installAuth,
  provisionRateLimit,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    if (!requirePlanFeature(customer.plan, "customer_portal", res)) return;
    const body = req.body as {
      device_id?: string;
      device_type?: string;
      serial_number?: string;
      provisioning_token?: string;
      siteId?: string;
      floorId?: string;
      zoneId?: string;
    };
    if (!body.device_id || !body.device_type || !body.serial_number || !body.provisioning_token) {
      res.status(400).json({ error: "device_id, device_type, serial_number, provisioning_token required" });
      return;
    }
    try {
      const claimed = claimQrProvisioning({
        customerId: customer.customer_id,
        deviceId: body.device_id,
        deviceType: body.device_type,
        serialNumber: body.serial_number,
        provisioningToken: body.provisioning_token,
        siteId: body.siteId,
        floorId: body.floorId,
        zoneId: body.zoneId,
        claimedBy: req.admin?.username,
      });
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: "installer.qr.claim",
        entityType: "device",
        entityId: body.device_id,
      });
      res.json({ ok: true, ...claimed });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.post(
  "/:customerCode/devices/nfc/claim",
  ...installAuth,
  provisionRateLimit,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    if (!requirePlanFeature(customer.plan, "customer_portal", res)) return;
    const { nfcUid, deviceId, deviceType, serialNumber, siteId, floorId, zoneId } = req.body as {
      nfcUid?: string;
      deviceId?: string;
      deviceType?: string;
      serialNumber?: string;
      siteId?: string;
      floorId?: string;
      zoneId?: string;
    };
    if (!nfcUid) {
      res.status(400).json({ error: "nfcUid required" });
      return;
    }
    try {
      const claimed = claimNfcProvisioning({
        customerId: customer.customer_id,
        nfcUid,
        deviceId,
        deviceType,
        serialNumber,
        siteId,
        floorId,
        zoneId,
        claimedBy: req.admin?.username,
      });
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: "installer.nfc.claim",
        entityType: "device",
        entityId: claimed.deviceId,
      });
      res.json({ ok: true, ...claimed, placeholder: "smartphone NFC read TODO" });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.get("/:customerCode/install/checklist", ...portalViewAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  if (!requirePlanFeature(customer.plan, "customer_portal", res)) return;
  res.json(getCustomerInstallChecklist(customer.customer_id));
});

customerInstallerRouter.post(
  "/:customerCode/install/checklist/:item/complete",
  ...installAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const item = String(req.params.item) as ChecklistItemId;
    const { deviceId } = req.body as { deviceId?: string };
    if (!deviceId) {
      res.status(400).json({ error: "deviceId required in body" });
      return;
    }
    try {
      const completed = completeChecklistItem(
        customer.customer_id,
        deviceId,
        item,
        req.admin?.username
      );
      res.json({ item: completed });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

function deviceTestRoute(kind: DeviceTestKind) {
  return (req: AuthedRequest, res: Response) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const deviceId = String(req.params.id);
    try {
      const result = runDeviceConnectivityTest(customer.customer_id, deviceId, kind);
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: `installer.test.${kind}`,
        entityType: "device",
        entityId: deviceId,
        details: { ok: result.ok },
      });
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  };
}

customerInstallerRouter.post(
  "/:customerCode/devices/:id/test/heartbeat",
  ...installAuth,
  deviceTestRoute("heartbeat")
);
customerInstallerRouter.post(
  "/:customerCode/devices/:id/test/event",
  ...installAuth,
  deviceTestRoute("event")
);
customerInstallerRouter.post(
  "/:customerCode/devices/:id/test/relay",
  ...installAuth,
  deviceTestRoute("relay")
);
customerInstallerRouter.post(
  "/:customerCode/devices/:id/test/notification",
  ...installAuth,
  deviceTestRoute("notification")
);

customerInstallerRouter.get(
  "/:customerCode/install/mqtt/:deviceId",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    try {
      res.json(getMqttDiagnostic(customer.customer_id, String(req.params.deviceId)));
    } catch (e) {
      res.status(404).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.post(
  "/:customerCode/floorplans/:id/archive",
  ...installAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const floorId = String(req.params.id);
    if (!getFloorById(floorId)) {
      res.status(404).json({ error: "Floor not found" });
      return;
    }
    try {
      const result = archiveFloorplanToQnap({
        customerId: customer.customer_id,
        customerCode: customer.customer_code,
        floorId,
        actorId: req.admin?.userId,
      });
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.post(
  "/:customerCode/install/photos/upload",
  ...installAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const { deviceId, siteId, photoType, imageBase64, fileName } = req.body as {
      deviceId?: string;
      siteId?: string;
      photoType?: string;
      imageBase64?: string;
      fileName?: string;
    };
    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 required" });
      return;
    }
    const dir = path.join(process.cwd(), "uploads", "install-photos", customer.customer_code);
    fs.mkdirSync(dir, { recursive: true });
    const fname = fileName ?? `${uuid()}.jpg`;
    const full = path.join(dir, fname);
    const buf = Buffer.from(imageBase64, "base64");
    fs.writeFileSync(full, buf);
    const rel = path.join(customer.customer_code, fname).replace(/\\/g, "/");
    getDatabase()
      .prepare(
        `INSERT INTO install_photos (id, customer_id, device_id, site_id, photo_path, photo_type, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        uuid(),
        customer.customer_id,
        deviceId ?? null,
        siteId ?? null,
        rel,
        photoType ?? "install",
        req.admin?.username ?? null
      );
    res.status(201).json({
      ok: true,
      photoPath: rel,
      placeholder: "local mock storage",
    });
  }
);

customerInstallerRouter.get(
  "/:customerCode/devices/:id/label",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    try {
      res.json(getDeviceLabelData(customer.customer_id, String(req.params.id)));
    } catch (e) {
      res.status(404).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.get("/:customerCode/device-templates", ...portalViewAuth, (_req, res) => {
  res.json({ templates: listDeviceTemplates() });
});

customerInstallerRouter.get(
  "/:customerCode/install/completion-report",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const html = buildInstallCompletionReportHtml(
      customer.customer_code,
      req.admin?.username
    );
    const accept = req.header("accept") ?? "";
    if (accept.includes("application/json")) {
      res.json({
        customer: customer.customer_code,
        html,
        generatedAt: new Date().toISOString(),
      });
      return;
    }
    res.type("html").send(html);
  }
);

customerInstallerRouter.get("/:customerCode/install/billing-check", ...portalViewAuth, (req: AuthedRequest, res) => {
  const role = req.admin?.role ?? "viewer";
  res.json({
    canViewBilling: canViewBilling(role),
    role,
    hint: "Installer cannot access billing details",
  });
});

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
  runMqttRttTest,
  type DeviceTestKind,
} from "../../installer/device-connectivity-test.js";
import {
  buildInstallCompletionReportHtml,
  buildInstallCompletionReportPdf,
  buildCompletionReportMeta,
} from "../../installer/completion-report.js";
import { getDeviceLabelData } from "../../installer/device-label.js";
import {
  buildDevicesLabelsCsv,
  buildDeviceLabelSvg,
  buildTepraLabelsCsv,
  buildBrotherLabelsCsv,
  buildDeviceQrSvg,
} from "../../installer/device-label-export.js";
import { buildFirmwareConfig } from "../../installer/firmware-config.js";
import { getFieldLiveStatus } from "../../installer/field-live-status.js";
import { runLiveMqttAckTest } from "../../mqtt/ack-tracker.js";
import { INSTALL_PHOTO_TYPES, isValidInstallPhotoType } from "../../installer/install-photos.js";
import { config } from "../../config.js";
import type { CompletionReportLocale } from "../../installer/completion-report.js";
import { processOfflineSync, type OfflineSyncEntry } from "../../installer/offline-sync.js";
import {
  startInstallSession,
  completeInstallSession,
  listInstallSessions,
} from "../../installer/install-session.js";
import { isDryRunRequest, logDryRun } from "../../installer/dry-run.js";
import {
  issueDeviceCertificatePlaceholder,
  applyTrustToDeviceRow,
} from "../../provisioning/device-certificates.js";
import { archiveFloorplanToQnap } from "../../qnap/floorplan-archive.js";
import { getFloorById } from "../../site-builder/floor-store.js";
import {
  registerDeviceCsr,
  issueDeviceCertFromCsr,
  revokeDeviceCert,
  getDeviceCertStatus,
} from "../../provisioning/device-csr.js";
import { saveInstallPhoto, listInstallPhotos, deleteInstallPhoto } from "../../installer/install-photos.js";
import { getInstallDashboard } from "../../installer/install-dashboard.js";
import {
  evaluateFieldChecklist,
  updateFieldChecklistItem,
  getInstallerHomeCards,
  type FieldChecklistItemId,
  type FieldChecklistStatus,
} from "../../installer/installer-field-checklist.js";
import { getDeviceLabelJson } from "../../installer/device-label-export.js";

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
    if (isDryRunRequest(req)) {
      logDryRun(customer.customer_code, "installer.qr.claim", body as Record<string, unknown>);
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: "installer.qr.claim",
        entityType: "device",
        entityId: body.device_id,
        details: { dryRun: true },
      });
      res.json({ ok: true, dryRun: true, deviceId: body.device_id });
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
    if (isDryRunRequest(req)) {
      logDryRun(customer.customer_code, "installer.nfc.claim", { nfcUid, deviceId });
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: "installer.nfc.claim",
        entityType: "device",
        entityId: deviceId ?? nfcUid,
        details: { dryRun: true, nfcUid },
      });
      res.json({ ok: true, dryRun: true, deviceId: deviceId ?? `NFC-${nfcUid.replace(/:/g, "")}` });
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
      res.json({ ok: true, ...claimed, nfcReadMode: "manual_uid" });
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
    if (isDryRunRequest(req)) {
      logDryRun(customer.customer_code, "installer.checklist.complete", { deviceId, item });
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: "installer.checklist.complete",
        entityType: "device",
        entityId: deviceId,
        details: { item, dryRun: true },
      });
      res.json({ item: { id: item, completed: true, dryRun: true } });
      return;
    }
    try {
      const completed = completeChecklistItem(
        customer.customer_id,
        deviceId,
        item,
        req.admin?.username
      );
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: "installer.checklist.complete",
        entityType: "device",
        entityId: deviceId,
        details: { item },
      });
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
    if (photoType && !isValidInstallPhotoType(photoType)) {
      res.status(400).json({
        error: `Invalid photoType. Allowed: ${INSTALL_PHOTO_TYPES.join(", ")}`,
      });
      return;
    }
    if (isDryRunRequest(req)) {
      logDryRun(customer.customer_code, "installer.photo.upload", { deviceId, fileName });
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: "installer.photo.upload",
        entityType: "device",
        entityId: deviceId ?? "site",
        details: { dryRun: true },
      });
      res.status(201).json({ ok: true, dryRun: true, photoPath: "dry-run/placeholder.jpg" });
      return;
    }
    const saved = saveInstallPhoto({
      customerId: customer.customer_id,
      customerCode: customer.customer_code,
      deviceId,
      siteId,
      photoType,
      imageBase64,
      fileName,
      uploadedBy: req.admin?.username,
    });
    logAudit({
      ...auditContextFromRequest(req),
      tenantId: customer.tenant_id ?? customer.customer_id,
      action: "installer.photo.upload",
      entityType: "device",
      entityId: deviceId ?? "site",
      details: { photoPath: saved.photoPath, photoId: saved.id },
    });
    res.status(201).json({
      ok: true,
      id: saved.id,
      photoPath: saved.photoPath,
      photoType: saved.photoType,
      url: `/uploads/install_photos/${saved.photoPath}`,
      storage: config.storage.provider,
      allowedTypes: INSTALL_PHOTO_TYPES,
    });
  }
);

customerInstallerRouter.get(
  "/:customerCode/install/photos",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const photos = listInstallPhotos(customer.customer_id).map((p) => ({
      ...p,
      url: `/uploads/install_photos/${p.photoPath}`,
    }));
    res.json({ photos });
  }
);

customerInstallerRouter.delete(
  "/:customerCode/install/photos/:id",
  ...installAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    if (isDryRunRequest(req)) {
      res.json({ ok: true, dryRun: true });
      return;
    }
    const ok = deleteInstallPhoto(customer.customer_id, String(req.params.id));
    if (!ok) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }
    logAudit({
      ...auditContextFromRequest(req),
      tenantId: customer.tenant_id ?? customer.customer_id,
      action: "installer.photo.delete",
      entityType: "install_photo",
      entityId: String(req.params.id),
    });
    res.json({ ok: true });
  }
);

customerInstallerRouter.get(
  "/:customerCode/install/dashboard",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    res.json(getInstallDashboard(customer.customer_id));
  }
);

customerInstallerRouter.get(
  "/:customerCode/install/home-cards",
  ...portalViewAuth,
  async (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    try {
      const cards = await getInstallerHomeCards(customer.customer_code);
      res.json(cards);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.get(
  "/:customerCode/install/field-checklist",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    try {
      res.json(evaluateFieldChecklist(customer.customer_code));
    } catch (e) {
      res.status(404).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.put(
  "/:customerCode/install/field-checklist/:itemId",
  ...installAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const status = (req.body?.status ?? "done") as FieldChecklistStatus;
    try {
      const item = updateFieldChecklistItem(
        customer.customer_code,
        String(req.params.itemId) as FieldChecklistItemId,
        status
      );
      res.json(item);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
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
  async (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const dryRun = isDryRunRequest(req);
    const format = String(req.query.format ?? "html").toLowerCase();
    const localeRaw = String(req.query.locale ?? "ja").toLowerCase();
    const locale: CompletionReportLocale = localeRaw === "en" ? "en" : "ja";
    const html = buildInstallCompletionReportHtml(customer.customer_code, req.admin?.username, {
      dryRun,
      locale,
    });
    const meta = buildCompletionReportMeta(customer.customer_code, req.admin?.username, { dryRun });

    logAudit({
      ...auditContextFromRequest(req),
      tenantId: customer.tenant_id ?? customer.customer_id,
      action: "installer.completion_report.export",
      entityType: "customer",
      entityId: customer.customer_code,
      details: { format, exportId: meta.exportId, dryRun },
    });

    const accept = req.header("accept") ?? "";
    if (accept.includes("application/json") && format !== "pdf") {
      res.json({
        customer: customer.customer_code,
        html,
        meta,
        generatedAt: meta.generatedAt,
      });
      return;
    }

    if (format === "pdf") {
      const pdf = await buildInstallCompletionReportPdf(html);
      if (pdf) {
        res.type("application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="install-report-${meta.exportId}.pdf"`);
        res.send(pdf);
        return;
      }
      res.setHeader("X-TiSLY-Pdf-Fallback", "html");
      res.type("html").send(html);
      return;
    }

    res.type("html").send(html);
  }
);

customerInstallerRouter.post(
  "/:customerCode/install/sync",
  ...installAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    if (isDryRunRequest(req)) {
      logDryRun(customer.customer_code, "installer.offline.sync", { count: (req.body.entries ?? []).length });
      res.json({ ok: true, dryRun: true, applied: 0, message: "Dry run — sync not applied" });
      return;
    }
    const { entries } = req.body as { entries?: OfflineSyncEntry[] };
    const report = processOfflineSync(
      customer.customer_id,
      entries ?? [],
      req.admin?.username
    );
    logAudit({
      ...auditContextFromRequest(req),
      tenantId: customer.tenant_id ?? customer.customer_id,
      action: "installer.offline.sync",
      entityType: "customer",
      entityId: customer.customer_code,
      details: { applied: report.applied, rejected: report.rejected },
    });
    res.json(report);
  }
);

customerInstallerRouter.post(
  "/:customerCode/install/session/start",
  ...installAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const { siteId, mode } = req.body as { siteId?: string; mode?: "live" | "dry_run" | "practice" };
    const sessionMode = isDryRunRequest(req) ? "dry_run" : (mode ?? "live");
    const session = startInstallSession({
      customerId: customer.customer_id,
      siteId,
      installerUserId: req.admin?.userId,
      mode: sessionMode,
    });
    logAudit({
      ...auditContextFromRequest(req),
      tenantId: customer.tenant_id ?? customer.customer_id,
      action: "installer.session.start",
      entityType: "install_session",
      entityId: session.id,
      details: { mode: session.mode },
    });
    res.status(201).json(session);
  }
);

customerInstallerRouter.post(
  "/:customerCode/install/session/complete",
  ...installAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }
    try {
      const session = completeInstallSession(sessionId, customer.customer_id);
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: "installer.session.complete",
        entityType: "install_session",
        entityId: session.id,
      });
      res.json(session);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.get(
  "/:customerCode/install/sessions",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    res.json({ sessions: listInstallSessions(customer.customer_id) });
  }
);

customerInstallerRouter.get(
  "/:customerCode/devices/labels.csv",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const csv = buildDevicesLabelsCsv(customer.customer_id);
    res.type("text/csv").setHeader("Content-Disposition", 'attachment; filename="device-labels.csv"');
    res.send(csv);
  }
);

customerInstallerRouter.get(
  "/:customerCode/devices/:id/label.svg",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    try {
      const svg = buildDeviceLabelSvg(customer.customer_id, String(req.params.id));
      res.type("image/svg+xml").send(svg);
    } catch (e) {
      res.status(404).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.post(
  "/:customerCode/devices/:id/test/mqtt-rtt",
  ...installAuth,
  provisionRateLimit,
  async (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const deviceId = String(req.params.id);
    if (isDryRunRequest(req)) {
      logDryRun(customer.customer_code, "installer.test.mqtt_rtt", { deviceId });
      res.json({
        ok: true,
        dryRun: true,
        roundTripMs: 55,
        rtt_ms: 55,
        mock: true,
        timeout: false,
        broker_status: "dry_run",
        topic: `tisly/dry/${deviceId}/test/rtt`,
        tested_at: new Date().toISOString(),
      });
      return;
    }
    try {
      const result = await runMqttRttTest(customer.customer_id, deviceId);
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: "installer.test.mqtt_rtt",
        entityType: "device",
        entityId: deviceId,
        details: { rtt_ms: result.rtt_ms, mock: result.mock, timeout: result.timeout },
      });
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.post(
  "/:customerCode/devices/:id/csr",
  ...installAuth,
  provisionRateLimit,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const deviceId = String(req.params.id);
    const { csrPem } = req.body as { csrPem?: string };
    if (isDryRunRequest(req)) {
      logDryRun(customer.customer_code, "installer.csr.register", { deviceId });
      res.json({ ok: true, dryRun: true, deviceId });
      return;
    }
    try {
      const record = registerDeviceCsr(customer.customer_id, deviceId, csrPem ?? "", req.admin?.username);
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: "installer.csr.register",
        entityType: "device",
        entityId: deviceId,
      });
      res.status(201).json(record);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.post(
  "/:customerCode/devices/:id/cert/issue",
  ...installAuth,
  provisionRateLimit,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const deviceId = String(req.params.id);
    if (isDryRunRequest(req)) {
      logDryRun(customer.customer_code, "installer.cert.issue", { deviceId });
      res.json({ ok: true, dryRun: true, deviceId, placeholder: true });
      return;
    }
    try {
      const cert = issueDeviceCertFromCsr(customer.customer_id, deviceId);
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: "installer.cert.issue",
        entityType: "device",
        entityId: deviceId,
      });
      res.json({ ...cert, placeholder: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.post(
  "/:customerCode/devices/:id/cert/revoke",
  ...installAuth,
  provisionRateLimit,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const deviceId = String(req.params.id);
    if (isDryRunRequest(req)) {
      res.json({ ok: true, dryRun: true, deviceId, certStatus: "revoked" });
      return;
    }
    try {
      const revoked = revokeDeviceCert(customer.customer_id, deviceId);
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: "installer.cert.revoke",
        entityType: "device",
        entityId: deviceId,
      });
      res.json(revoked);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.get(
  "/:customerCode/devices/:id/cert/status",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    try {
      res.json(getDeviceCertStatus(customer.customer_id, String(req.params.id)));
    } catch (e) {
      res.status(404).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.get(
  "/:customerCode/devices/:id/label.json",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    try {
      res.json(getDeviceLabelJson(customer.customer_id, customer.customer_code, String(req.params.id)));
    } catch (e) {
      res.status(404).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.get(
  "/:customerCode/devices/:id/cert-placeholder",
  ...installAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const deviceId = String(req.params.id);
    const cert = issueDeviceCertificatePlaceholder(deviceId);
    if (!isDryRunRequest(req)) {
      applyTrustToDeviceRow(deviceId, customer.customer_id, cert);
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: "installer.cert.placeholder",
        entityType: "device",
        entityId: deviceId,
      });
    }
    res.json({ ...cert, dryRun: isDryRunRequest(req) });
  }
);

customerInstallerRouter.get(
  "/:customerCode/install/field-live-status",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    res.json({ customer: customer.customer_code, ...getFieldLiveStatus() });
  }
);

customerInstallerRouter.get(
  "/:customerCode/devices/:id/firmware-config",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    try {
      res.json(buildFirmwareConfig(customer.customer_id, String(req.params.id)));
    } catch (e) {
      res.status(404).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.post(
  "/:customerCode/devices/:id/test/live-mqtt",
  ...installAuth,
  provisionRateLimit,
  async (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const deviceId = String(req.params.id);
    if (isDryRunRequest(req)) {
      logDryRun(customer.customer_code, "installer.test.live_mqtt", { deviceId });
      res.json({
        ok: true,
        dryRun: true,
        rtt_ms: 52,
        ack_received: true,
        mock: true,
        topic: `tisly/dry/${deviceId}/test/live`,
      });
      return;
    }
    try {
      const result = await runLiveMqttAckTest(customer.customer_id, deviceId);
      logAudit({
        ...auditContextFromRequest(req),
        tenantId: customer.tenant_id ?? customer.customer_id,
        action: "installer.test.live_mqtt",
        entityType: "device",
        entityId: deviceId,
        details: { rtt_ms: result.rtt_ms, mock: result.mock, timeout: result.timeout },
      });
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

customerInstallerRouter.get(
  "/:customerCode/devices/labels/tepra.csv",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const csv = buildTepraLabelsCsv(customer.customer_id);
    res.type("text/csv").setHeader("Content-Disposition", 'attachment; filename="device-labels-tepra.csv"');
    res.send(csv);
  }
);

customerInstallerRouter.get(
  "/:customerCode/devices/labels/brother.csv",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const csv = buildBrotherLabelsCsv(customer.customer_id);
    res.type("text/csv").setHeader("Content-Disposition", 'attachment; filename="device-labels-brother.csv"');
    res.send(csv);
  }
);

customerInstallerRouter.get(
  "/:customerCode/devices/:id/qr.svg",
  ...portalViewAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    try {
      const svg = buildDeviceQrSvg(customer.customer_id, String(req.params.id));
      res.type("image/svg+xml").send(svg);
    } catch (e) {
      res.status(404).json({ error: String(e) });
    }
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

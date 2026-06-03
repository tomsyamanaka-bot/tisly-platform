import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { requireTenantMatch } from "../../auth/tenant-guard.js";
import { canAccessCustomer } from "../../auth/customer-auth.js";
import { getCustomerByCode } from "../../customer/customer-store.js";
import { requirePlanFeature } from "../../customer/plan-guard.js";
import { getDatabase } from "../../db/database.js";
import { config } from "../../config.js";
import { createQrProvisioning, claimQrProvisioning } from "../../provisioning/qr-provisioning.js";
import { buildFirmwareConfig } from "../../installer/firmware-config.js";
import { recordDeviceHeartbeat, getHeartbeatThresholds } from "../../device/device-heartbeat.js";
import { getDeviceStatusSummary } from "../../device/device-state.js";
import { appendDeviceTimeline, listDeviceTimeline } from "../../device/device-timeline.js";
import { setDeviceCommissioning } from "../../device/device-state.js";
import {
  buildDeviceProvisioningReportData,
  buildDeviceProvisioningReportHtml,
  buildDeviceProvisioningReportPdf,
} from "../../installer/device-provisioning-report.js";
import { emitSimulatorEvent } from "../../demo/demo-mode-esp.js";
import { sendDiscord } from "../../notification/channels/discord.js";
import { sendEmail } from "../../notification/channels/email.js";
import { sendWebPush } from "../../notification/channels/web-push.js";
import { listMapDevicesForCustomer } from "../../site-builder/map-store.js";
import { v4 as uuid } from "uuid";
import { auditContextFromRequest, logAudit } from "../../provisioning/audit-log.js";

export const deviceCommissioningRouter = Router();

const installAuth = [requireAuth("installer"), requireTenantMatch("customerCode")] as const;
const portalAuth = [requireAuth("viewer"), requireTenantMatch("customerCode")] as const;

function resolveCustomer(req: AuthedRequest, code: string) {
  const customer = getCustomerByCode(code);
  if (!customer) return null;
  if (req.admin && !canAccessCustomer(req.admin, customer.customer_id)) return null;
  return customer;
}

deviceCommissioningRouter.get(
  "/:customerCode/devices/onboard/state",
  ...installAuth,
  (req: AuthedRequest, res: Response) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({
      steps: ["create", "qr", "claim", "firmware", "heartbeat", "complete"],
      demoMode: config.demoMode,
      thresholds: getHeartbeatThresholds(),
    });
  }
);

deviceCommissioningRouter.post(
  "/:customerCode/devices/onboard/create",
  ...installAuth,
  (req: AuthedRequest, res: Response) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { deviceId, deviceType, serialNumber, siteId } = req.body as {
      deviceId?: string;
      deviceType?: string;
      serialNumber?: string;
      siteId?: string;
    };
    if (!deviceId || !deviceType) {
      res.status(400).json({ error: "deviceId and deviceType required" });
      return;
    }
    const db = getDatabase();
    const existing = db
      .prepare(`SELECT id FROM devices WHERE device_id = ? AND customer_id = ?`)
      .get(deviceId, customer.customer_id) as { id: string } | undefined;
    const id = existing?.id ?? uuid();
    if (existing) {
      db.prepare(
        `UPDATE devices SET device_type = ?, serial_number = COALESCE(?, serial_number),
          device_status = 'COMMISSIONING', commissioning_status = 'draft', updated_at = datetime('now')
         WHERE id = ?`
      ).run(deviceType, serialNumber ?? deviceId, id);
    } else {
      db.prepare(
        `INSERT INTO devices (id, customer_id, site_id, device_id, device_type, serial_number,
          commissioning_status, device_status, label)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', 'COMMISSIONING', ?)`
      ).run(
        id,
        customer.customer_id,
        siteId ?? null,
        deviceId,
        deviceType,
        serialNumber ?? deviceId,
        deviceId
      );
    }
    setDeviceCommissioning(deviceId);
    appendDeviceTimeline({
      deviceId,
      customerId: customer.customer_id,
      eventType: "created",
      title: "Device 作成",
      actor: req.admin?.username,
    });
    try {
      logAudit({
        ...auditContextFromRequest(req),
        action: "device_onboard_create",
        targetType: "device",
        targetId: deviceId,
        tenantId: customer.tenant_id ?? customer.customer_id,
      });
    } catch {
      /* audit optional in test */
    }
    res.status(201).json({ deviceId, deviceType, status: "COMMISSIONING" });
  }
);

deviceCommissioningRouter.post(
  "/:customerCode/devices/onboard/qr",
  ...installAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { deviceId, deviceType, serialNumber } = req.body as {
      deviceId: string;
      deviceType: string;
      serialNumber?: string;
    };
    const result = createQrProvisioning({
      customerId: customer.customer_id,
      deviceId,
      deviceType,
      serialNumber: serialNumber ?? deviceId,
      createdBy: req.admin?.username,
    });
    appendDeviceTimeline({
      deviceId,
      customerId: customer.customer_id,
      eventType: "qr_issued",
      title: "QR 発行",
      actor: req.admin?.username,
    });
    res.json(result);
  }
);

deviceCommissioningRouter.post(
  "/:customerCode/devices/onboard/claim",
  ...installAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const body = req.body as {
      device_id: string;
      device_type: string;
      serial_number: string;
      provisioning_token: string;
      site_id?: string;
    };
    const claimed = claimQrProvisioning({
      customerId: customer.customer_id,
      deviceId: body.device_id,
      deviceType: body.device_type,
      serialNumber: body.serial_number,
      provisioningToken: body.provisioning_token,
      siteId: body.site_id,
      claimedBy: req.admin?.username,
    });
    appendDeviceTimeline({
      deviceId: body.device_id,
      customerId: customer.customer_id,
      eventType: "claimed",
      title: "Device Claim",
      actor: req.admin?.username,
    });
    res.json(claimed);
  }
);

deviceCommissioningRouter.get(
  "/:customerCode/devices/:deviceId/onboard/firmware",
  ...installAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    try {
      const fw = buildFirmwareConfig(customer.customer_id, String(req.params.deviceId));
      appendDeviceTimeline({
        deviceId: String(req.params.deviceId),
        customerId: customer.customer_id,
        eventType: "config_change",
        title: "Firmware Config Export",
      });
      res.json({ firmware: fw });
    } catch (e) {
      res.status(404).json({ error: String(e) });
    }
  }
);

deviceCommissioningRouter.post(
  "/:customerCode/devices/:deviceId/onboard/heartbeat-check",
  ...installAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const deviceId = String(req.params.deviceId);
    const db = getDatabase();
    const row = db
      .prepare(
        `SELECT last_heartbeat_at, device_status FROM devices WHERE customer_id = ? AND device_id = ?`
      )
      .get(customer.customer_id, deviceId) as
      | { last_heartbeat_at: string | null; device_status: string | null }
      | undefined;
    if (!row) {
      res.status(404).json({ error: "Device not found" });
      return;
    }
    const ok =
      row.device_status === "ONLINE" ||
      (row.last_heartbeat_at &&
        Date.now() - new Date(row.last_heartbeat_at).getTime() < getHeartbeatThresholds().warnSec * 1000);
    res.json({
      ok: !!ok,
      deviceStatus: row.device_status,
      lastHeartbeatAt: row.last_heartbeat_at,
      thresholds: getHeartbeatThresholds(),
    });
  }
);

deviceCommissioningRouter.post(
  "/:customerCode/devices/onboard/complete",
  ...installAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { deviceId } = req.body as { deviceId: string };
    const db = getDatabase();
    db.prepare(
      `UPDATE devices SET commissioning_status = 'completed', commissioned_at = datetime('now'),
        commissioned_by = ?, device_status = COALESCE(device_status, 'UNKNOWN')
       WHERE customer_id = ? AND device_id = ?`
    ).run(req.admin?.username ?? null, customer.customer_id, deviceId);
    res.json({ ok: true, deviceId });
  }
);

deviceCommissioningRouter.get(
  "/:customerCode/devices/timeline",
  ...portalAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const deviceId = req.query.deviceId as string | undefined;
    res.json({
      entries: listDeviceTimeline(customer.customer_id, deviceId, 200),
    });
  }
);

deviceCommissioningRouter.get(
  "/:customerCode/map/live",
  ...portalAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const devices = listMapDevicesForCustomer(customer.customer_id, customer.tenant_id);
    res.json({ devices, refreshedAt: new Date().toISOString() });
  }
);

deviceCommissioningRouter.get(
  "/:customerCode/health",
  ...portalAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!requirePlanFeature(customer.plan, "customer_portal", res)) return;
    const db = getDatabase();
    const deviceSummary = getDeviceStatusSummary(customer.customer_id);
    const mqttOk = config.mqttUrlConfigured || config.demoMode;
    const webhooks = (
      db
        .prepare(`SELECT COUNT(*) as c FROM customer_webhooks WHERE customer_id = ? AND enabled = 1`)
        .get(customer.customer_id) as { c: number }
    ).c;
    const tvCount = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM devices WHERE customer_id = ? AND UPPER(device_type) = 'TV'`
        )
        .get(customer.customer_id) as { c: number }
    ).c;
    const certPending = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM devices WHERE customer_id = ? AND COALESCE(cert_status, 'none') != 'issued'`
        )
        .get(customer.customer_id) as { c: number }
    ).c;

    res.json({
      customerCode: customer.customer_code,
      devices: deviceSummary,
      mqtt: { status: mqttOk ? "ok" : "not_configured", broker: config.mqtt.url || null },
      webhooks: { enabled: webhooks, status: webhooks > 0 ? "ok" : "none" },
      storage: { provider: config.storage.provider, status: "ok" },
      tv: { count: tvCount, status: tvCount > 0 ? "ok" : "none" },
      certificate: { pending: certPending, status: certPending === 0 ? "ok" : "attention" },
      demoMode: config.demoMode,
    });
  }
);

deviceCommissioningRouter.post(
  "/:customerCode/simulator/event",
  ...portalAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { scenario, deviceId } = req.body as { scenario: string; deviceId?: string };
    const result = emitSimulatorEvent(customer.customer_code, scenario, deviceId);
    res.json(result);
  }
);

deviceCommissioningRouter.post(
  "/:customerCode/notifications/test-all",
  ...portalAuth,
  async (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const payload = {
      title: `[${customer.customer_code}] 通知テスト`,
      body: "Notification Test Center — 一括送信",
      eventType: "notification_test",
      deviceId: "NOTIFICATION-TEST",
      severity: "info" as const,
    };
    const results = await Promise.all([
      sendWebPush(payload).catch((e) => ({ channel: "web_push", ok: false, error: String(e) })),
      sendDiscord(payload).catch((e) => ({ channel: "discord", ok: false, error: String(e) })),
      sendEmail(payload).catch((e) => ({ channel: "email", ok: false, error: String(e) })),
    ]);
    const db = getDatabase();
    const hooks = db
      .prepare(`SELECT id, url FROM customer_webhooks WHERE customer_id = ? AND enabled = 1`)
      .all(customer.customer_id) as Array<{ id: string; url: string }>;
    const webhookResults: Array<{ id: string; ok: boolean }> = [];
    for (const h of hooks) {
      try {
        const r = await fetch(h.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, customerCode: customer.customer_code }),
        });
        webhookResults.push({ id: h.id, ok: r.ok });
      } catch {
        webhookResults.push({ id: h.id, ok: false });
      }
    }
    appendDeviceTimeline({
      deviceId: "NOTIFICATION-TEST",
      customerId: customer.customer_id,
      eventType: "notification",
      title: "通知テスト一括送信",
      actor: req.admin?.username,
    });
    res.json({ channels: results, webhooks: webhookResults });
  }
);

deviceCommissioningRouter.get(
  "/:customerCode/devices/:deviceId/provisioning-report",
  ...installAuth,
  async (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const format = (req.query.format as string) ?? "html";
    const data = buildDeviceProvisioningReportData(
      customer.customer_code,
      String(req.params.deviceId),
      req.admin?.username
    );
    if (format === "pdf") {
      const buf = await buildDeviceProvisioningReportPdf(data);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="provisioning-${data.deviceId}.pdf"`
      );
      res.send(buf);
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(buildDeviceProvisioningReportHtml(data));
  }
);

deviceCommissioningRouter.post(
  "/:customerCode/heartbeat",
  ...portalAuth,
  (req: AuthedRequest, res) => {
    const { deviceId, platform } = req.body as { deviceId?: string; platform?: string };
    if (!deviceId) {
      res.status(400).json({ error: "deviceId required" });
      return;
    }
    const status = recordDeviceHeartbeat(deviceId, platform);
    appendDeviceTimeline({
      deviceId,
      eventType: "heartbeat",
      title: "Heartbeat 受信",
    });
    res.json({ ok: true, deviceStatus: status });
  }
);

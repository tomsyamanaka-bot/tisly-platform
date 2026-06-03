import { Router } from "express";
import { v4 as uuid } from "uuid";
import { config } from "../../config.js";
import { getDatabase } from "../../db/database.js";
import {
  normalizeUnifiedInput,
  unifiedToTislyEvent,
} from "../../event/unified-event.js";
import { recordHeartbeat } from "../../notification/heartbeat-monitor.js";
import { getNotificationService } from "../../notification/notification-service.js";
import { broadcast } from "../../ws/hub.js";
import { requireIngestOrDeviceAuth } from "../../auth/device-auth.js";
import { requireAdminAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { randomBytes } from "crypto";
import { hashSecret } from "../../provisioning/site-provisioner.js";
import { auditContextFromRequest, logAudit } from "../../provisioning/audit-log.js";

export const devicesRouter = Router();

interface DeviceRow {
  id: string;
  user_id: string | null;
  device_type: string;
  platform: string | null;
  device_id: string;
  label: string | null;
  last_heartbeat_at: string | null;
  heartbeat_status: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

function parseMetadata(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function formatDevice(row: DeviceRow) {
  const meta = parseMetadata(row.metadata_json);
  return {
    id: row.id,
    deviceId: row.device_id,
    deviceType: row.device_type,
    platform: row.platform,
    label: row.label,
    tenantId: (meta.tenant_id as string) ?? config.defaultTenantId,
    siteId: (meta.site_id as string) ?? "default",
    lastHeartbeatAt: row.last_heartbeat_at,
    heartbeatStatus: row.heartbeat_status,
    metadata: meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function findDeviceRow(param: string): DeviceRow | undefined {
  const db = getDatabase();
  const byUuid = db.prepare("SELECT * FROM devices WHERE id = ?").get(param) as
    | DeviceRow
    | undefined;
  if (byUuid) return byUuid;
  return db.prepare("SELECT * FROM devices WHERE device_id = ?").get(param) as
    | DeviceRow
    | undefined;
}

devicesRouter.get("/", (req, res) => {
  const db = getDatabase();
  const deviceType = req.query.deviceType as string | undefined;
  const platform = req.query.platform as string | undefined;
  const siteId = req.query.siteId as string | undefined;

  let sql = "SELECT * FROM devices WHERE 1=1";
  const params: unknown[] = [];
  const ops = (req as import("express").Request & { opsScope?: { customerId?: string; tenantId?: string } })
    .opsScope;
  if (ops?.customerId) {
    sql += " AND (customer_id = ? OR tenant_id = ?)";
    params.push(ops.customerId, ops.tenantId ?? ops.customerId);
  }
  if (deviceType) {
    sql += " AND device_type = ?";
    params.push(deviceType);
  }
  if (platform) {
    sql += " AND platform = ?";
    params.push(platform);
  }
  sql += " ORDER BY updated_at DESC";
  const rows = db.prepare(sql).all(...params) as DeviceRow[];
  let devices = rows.map(formatDevice);
  if (siteId) {
    devices = devices.filter((d) => d.siteId === siteId);
  }
  res.json({ devices, count: devices.length });
});

devicesRouter.post("/register", requireIngestOrDeviceAuth, (req, res) => {
  const {
    deviceId,
    deviceType,
    platform,
    label,
    userId,
    tenantId,
    siteId,
    metadata,
    sourceType,
  } = req.body;

  if (!deviceId || typeof deviceId !== "string") {
    res.status(400).json({ error: "deviceId required" });
    return;
  }

  const meta: Record<string, unknown> = {
    ...(typeof metadata === "object" && metadata ? metadata : {}),
    tenant_id: tenantId ?? config.defaultTenantId,
    site_id: siteId ?? "default",
    source_type: sourceType ?? platform ?? deviceType ?? "gateway",
    registered_at: new Date().toISOString(),
    integration_phase: "101-120",
  };

  const db = getDatabase();
  const existing = db
    .prepare("SELECT * FROM devices WHERE device_id = ?")
    .get(deviceId) as DeviceRow | undefined;

  if (existing) {
    const merged = { ...parseMetadata(existing.metadata_json), ...meta };
    db.prepare(
      `UPDATE devices SET device_type = COALESCE(?, device_type), platform = COALESCE(?, platform),
       label = COALESCE(?, label), user_id = COALESCE(?, user_id), metadata_json = ?,
       updated_at = datetime('now') WHERE device_id = ?`
    ).run(
      deviceType,
      platform,
      label,
      userId,
      JSON.stringify(merged),
      deviceId
    );
    const updated = findDeviceRow(deviceId)!;
    res.json({ ...formatDevice(updated), updated: true });
    return;
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO devices (id, user_id, device_type, platform, device_id, label, metadata_json, heartbeat_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'unknown')`
  ).run(
    id,
    userId ?? null,
    deviceType ?? "gateway",
    platform ?? "unknown",
    deviceId,
    label ?? deviceId,
    JSON.stringify(meta)
  );
  const row = findDeviceRow(id)!;
  res.status(201).json(formatDevice(row));
});

devicesRouter.get("/:id", (req, res) => {
  const row = findDeviceRow(req.params.id);
  if (!row) {
    res.status(404).json({ error: "device not found" });
    return;
  }
  res.json(formatDevice(row));
});

devicesRouter.patch("/:id", (req, res) => {
  const row = findDeviceRow(req.params.id);
  if (!row) {
    res.status(404).json({ error: "device not found" });
    return;
  }

  const { deviceType, platform, label, siteId, tenantId, metadata, heartbeatStatus } =
    req.body;
  const meta = { ...parseMetadata(row.metadata_json) };
  if (siteId !== undefined) meta.site_id = siteId;
  if (tenantId !== undefined) meta.tenant_id = tenantId;
  if (metadata && typeof metadata === "object") {
    Object.assign(meta, metadata);
  }

  const db = getDatabase();
  db.prepare(
    `UPDATE devices SET
       device_type = COALESCE(?, device_type),
       platform = COALESCE(?, platform),
       label = COALESCE(?, label),
       heartbeat_status = COALESCE(?, heartbeat_status),
       metadata_json = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    deviceType,
    platform,
    label,
    heartbeatStatus,
    JSON.stringify(meta),
    row.id
  );

  const updated = findDeviceRow(row.id)!;
  res.json(formatDevice(updated));
});

devicesRouter.post("/:id/test", async (req, res) => {
  const row = findDeviceRow(req.params.id);
  if (!row) {
    res.status(404).json({ error: "device not found" });
    return;
  }

  const meta = parseMetadata(row.metadata_json);
  const unified = normalizeUnifiedInput(
    {
      event_id: `test-${uuid()}`,
      tenant_id: meta.tenant_id ?? config.defaultTenantId,
      site_id: meta.site_id ?? "default",
      device_id: row.device_id,
      source_type: (meta.source_type as string) ?? row.platform ?? "system",
      event_type: req.body?.eventType ?? "device_test",
      severity: req.body?.severity ?? "info",
      zone: req.body?.zone ?? "test",
      message: req.body?.message ?? `実機テスト — ${row.label ?? row.device_id}`,
      payload: { test: true, ...(req.body?.payload ?? {}) },
      created_at: new Date().toISOString(),
    },
    config.defaultTenantId
  );

  const service = getNotificationService();
  const id = await service.processEvent(unifiedToTislyEvent(unified));
  broadcast({ type: "event", payload: { ...unified, id }, at: unified.created_at });

  res.status(201).json({
    ok: true,
    eventId: id,
    deviceId: row.device_id,
    message: "test event processed",
  });
});

devicesRouter.post("/:id/restart-request", (req, res) => {
  const row = findDeviceRow(req.params.id);
  if (!row) {
    res.status(404).json({ error: "device not found" });
    return;
  }

  const requestId = uuid();
  const meta = parseMetadata(row.metadata_json);
  meta.last_restart_request = {
    requestId,
    requestedAt: new Date().toISOString(),
    reason: req.body?.reason ?? "operator_request",
    status: "pending",
  };

  const db = getDatabase();
  db.prepare(
    `UPDATE devices SET metadata_json = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(meta), row.id);

  broadcast({
    type: "event",
    payload: {
      command: "restart",
      deviceId: row.device_id,
      requestId,
      via: "mqtt_cmd_topic",
      topicHint: `tisly/${meta.tenant_id ?? config.defaultTenantId}/${meta.site_id ?? "default"}/${row.device_id}/cmd`,
    },
    at: new Date().toISOString(),
  });

  res.json({
    ok: true,
    requestId,
    deviceId: row.device_id,
    note: "実機は MQTT cmd トピックまたは OTA で再起動。現状は要求を記録のみ",
  });
});

devicesRouter.post("/:deviceId/heartbeat", (req, res) => {
  recordHeartbeat(req.params.deviceId, req.body?.platform);
  res.json({ ok: true, deviceId: req.params.deviceId });
});

function generateDeviceSecret(): string {
  return randomBytes(24).toString("base64url");
}

devicesRouter.post("/:id/rotate-secret", requireAdminAuth, (req: AuthedRequest, res) => {
  const deviceId = String(req.params.id);
  const db = getDatabase();
  const cred = db
    .prepare(
      `SELECT site_id, tenant_id FROM device_credentials
       WHERE device_id = ? AND status = 'active'`
    )
    .get(deviceId) as { site_id: string; tenant_id: string } | undefined;
  if (!cred) {
    res.status(404).json({ error: "device credentials not found" });
    return;
  }
  const newSecret = generateDeviceSecret();
  db.prepare(
    `UPDATE device_credentials SET secret_hash = ?, rotated_at = datetime('now')
     WHERE device_id = ?`
  ).run(hashSecret(newSecret), deviceId);

  logAudit({
    userId: req.admin?.userId,
    actorLabel: req.admin?.username,
    siteId: cred.site_id,
    tenantId: cred.tenant_id,
    action: "device.rotate_secret",
    targetType: "device",
    targetId: deviceId,
    ...auditContextFromRequest(req),
  });

  res.json({
    ok: true,
    deviceId,
    secret: newSecret,
    warning: "Secret shown once — update device configuration",
  });
});

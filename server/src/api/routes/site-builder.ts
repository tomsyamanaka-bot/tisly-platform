import { Router } from "express";
import { requireAdminAuth, requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { getCustomerByCode } from "../../customer/customer-store.js";
import {
  createSite,
  deleteSite,
  getSiteById,
  listSitesForCustomerId,
  updateSite,
} from "../../site-builder/site-store.js";
import {
  createFloor,
  deleteFloor,
  getFloorById,
  listFloorsForSite,
  updateFloor,
} from "../../site-builder/floor-store.js";
import {
  createZone,
  deleteZone,
  getZoneById,
  listZonesForFloor,
  listZonesForSite,
  updateZone,
} from "../../site-builder/zone-store.js";
import {
  clearDeviceMapPosition,
  getFloorMapView,
  listMapDevicesForCustomer,
  updateDeviceMapPosition,
} from "../../site-builder/map-store.js";
import { createCamera, listCamerasForCustomer, updateCamera } from "../../site-builder/camera-store.js";
import { createSchedule, listSchedules } from "../../schedule/schedule-engine.js";
import {
  createCustomerRecoveryRule,
  deleteCustomerRecoveryRule,
  listCustomerRecoveryRules,
  updateCustomerRecoveryRule,
} from "../../recovery/customer-recovery-rules.js";
import { requireTenantMatch } from "../../auth/tenant-guard.js";
import { canAccessCustomer } from "../../auth/customer-auth.js";
import { requirePlanFeature } from "../../customer/plan-guard.js";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../../db/database.js";
import { listDevicesForCustomer } from "../../customer/customer-store.js";

export const siteApiRouter = Router();
export const floorApiRouter = Router();
export const zoneApiRouter = Router();
export const mapApiRouter = Router();

const adminSite = [requireAdminAuth] as const;

siteApiRouter.get("/", ...adminSite, (req, res) => {
  const customerId = String(req.query.customerId ?? "");
  if (!customerId) {
    res.status(400).json({ error: "customerId required" });
    return;
  }
  res.json({ sites: listSitesForCustomerId(customerId) });
});

siteApiRouter.post("/", ...adminSite, (req, res) => {
  const { tenantId, customerId, name, address, timezone, siteType } = req.body as {
    tenantId?: string;
    customerId?: string;
    name?: string;
    address?: string;
    timezone?: string;
    siteType?: string;
  };
  if (!tenantId || !customerId || !name) {
    res.status(400).json({ error: "tenantId, customerId, name required" });
    return;
  }
  res.status(201).json({ site: createSite({ tenantId, customerId, name, address, timezone, siteType }) });
});

siteApiRouter.get("/:siteId", ...adminSite, (req, res) => {
  const site = getSiteById(String(req.params.siteId));
  if (!site) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ site, floors: listFloorsForSite(site.id), zones: listZonesForSite(site.id) });
});

siteApiRouter.patch("/:siteId", ...adminSite, (req, res) => {
  const site = updateSite(String(req.params.siteId), req.body);
  if (!site) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ site });
});

siteApiRouter.delete("/:siteId", ...adminSite, (req, res) => {
  if (!deleteSite(String(req.params.siteId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

floorApiRouter.get("/", ...adminSite, (req, res) => {
  const siteId = String(req.query.siteId ?? "");
  if (!siteId) {
    res.status(400).json({ error: "siteId required" });
    return;
  }
  res.json({ floors: listFloorsForSite(siteId) });
});

floorApiRouter.post("/", ...adminSite, (req, res) => {
  const { siteId, name, orderNo } = req.body as { siteId?: string; name?: string; orderNo?: number };
  if (!siteId || !name) {
    res.status(400).json({ error: "siteId, name required" });
    return;
  }
  res.status(201).json({ floor: createFloor({ siteId, name, orderNo }) });
});

floorApiRouter.delete("/:floorId", ...adminSite, (req, res) => {
  if (!deleteFloor(String(req.params.floorId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

zoneApiRouter.get("/", ...adminSite, (req, res) => {
  const siteId = req.query.siteId as string | undefined;
  const floorId = req.query.floorId as string | undefined;
  if (floorId) {
    res.json({ zones: listZonesForFloor(floorId) });
    return;
  }
  if (!siteId) {
    res.status(400).json({ error: "siteId or floorId required" });
    return;
  }
  res.json({ zones: listZonesForSite(siteId) });
});

zoneApiRouter.post("/", ...adminSite, (req, res) => {
  const { siteId, floorId, name, type, sortOrder } = req.body as {
    siteId?: string;
    floorId?: string;
    name?: string;
    type?: string;
    sortOrder?: number;
  };
  if (!siteId || !name) {
    res.status(400).json({ error: "siteId, name required" });
    return;
  }
  res.status(201).json({ zone: createZone({ siteId, floorId, name, type, sortOrder }) });
});

zoneApiRouter.patch("/:zoneId", ...adminSite, (req, res) => {
  const zone = updateZone(String(req.params.zoneId), {
    name: req.body.name,
    type: req.body.type,
    floorId: req.body.floorId,
    sortOrder: req.body.sortOrder,
  });
  if (!zone) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ zone });
});

zoneApiRouter.delete("/:zoneId", ...adminSite, (req, res) => {
  if (!deleteZone(String(req.params.zoneId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

mapApiRouter.get("/devices", ...adminSite, (req, res) => {
  const customerId = String(req.query.customerId ?? "");
  if (!customerId) {
    res.status(400).json({ error: "customerId required" });
    return;
  }
  res.json({ devices: listMapDevicesForCustomer(customerId) });
});

mapApiRouter.get("/floor/:floorId", ...adminSite, (req, res) => {
  const view = getFloorMapView(String(req.params.floorId));
  if (!view) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(view);
});

/** Customer-scoped site builder routes (portal / installer). */
export const customerSiteBuilderRouter = Router();
const portalAuth = [requireAuth("viewer"), requireTenantMatch("customerCode")] as const;

function resolveCustomer(req: AuthedRequest, code: string) {
  const customer = getCustomerByCode(code);
  if (!customer) return null;
  if (req.admin && !canAccessCustomer(req.admin, customer.customer_id)) return null;
  return customer;
}

customerSiteBuilderRouter.get("/:customerCode/sites/builder", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  if (!requirePlanFeature(customer.plan, "customer_portal", res)) return;
  const sites = listSitesForCustomerId(customer.customer_id, customer.tenant_id);
  const enriched = sites.map((s) => ({
    ...s,
    floors: listFloorsForSite(s.id),
    zones: listZonesForSite(s.id),
  }));
  res.json({ sites: enriched });
});

customerSiteBuilderRouter.post("/:customerCode/sites", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  const { name, address, timezone } = req.body as { name?: string; address?: string; timezone?: string };
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const site = createSite({
    tenantId: customer.tenant_id ?? customer.customer_id,
    customerId: customer.customer_id,
    name,
    address,
    timezone,
  });
  res.status(201).json({ site });
});

customerSiteBuilderRouter.post("/:customerCode/floors", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  const { siteId, name, orderNo } = req.body as { siteId?: string; name?: string; orderNo?: number };
  if (!siteId || !name) {
    res.status(400).json({ error: "siteId, name required" });
    return;
  }
  const site = getSiteById(siteId);
  if (!site || site.customer_id !== customer.customer_id) {
    res.status(403).json({ error: "Site not in customer scope" });
    return;
  }
  res.status(201).json({ floor: createFloor({ siteId, name, orderNo }) });
});

customerSiteBuilderRouter.post("/:customerCode/zones", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  const { siteId, floorId, name, type } = req.body as {
    siteId?: string;
    floorId?: string;
    name?: string;
    type?: string;
  };
  if (!siteId || !name) {
    res.status(400).json({ error: "siteId, name required" });
    return;
  }
  const site = getSiteById(siteId);
  if (!site || site.customer_id !== customer.customer_id) {
    res.status(403).json({ error: "Site not in customer scope" });
    return;
  }
  res.status(201).json({ zone: createZone({ siteId, floorId, name, type }) });
});

customerSiteBuilderRouter.get("/:customerCode/map/devices", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  res.json({ devices: listMapDevicesForCustomer(customer.customer_id, customer.tenant_id) });
});

customerSiteBuilderRouter.post("/:customerCode/map/devices", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  const body = req.body as {
    deviceId?: string;
    posX?: number;
    posY?: number;
    iconType?: string;
    rotation?: number;
    zoneId?: string;
    floorId?: string;
    siteId?: string;
  };
  if (!body.deviceId) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }
  const ok = updateDeviceMapPosition(body.deviceId, body);
  if (!ok) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json({ ok: true });
});

customerSiteBuilderRouter.put("/:customerCode/map/devices/:deviceId", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  const ok = updateDeviceMapPosition(String(req.params.deviceId), req.body);
  if (!ok) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json({ ok: true });
});

customerSiteBuilderRouter.delete(
  "/:customerCode/map/devices/:deviceId",
  ...portalAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    clearDeviceMapPosition(String(req.params.deviceId));
    res.json({ ok: true });
  }
);

customerSiteBuilderRouter.get("/:customerCode/map/floor/:floorId", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  const view = getFloorMapView(String(req.params.floorId));
  if (!view) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const site = getSiteById(view.siteId);
  if (!site || site.customer_id !== customer.customer_id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(view);
});

const FLOOR_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const FLOOR_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function floorUploadDir(): string {
  const dir = path.join(process.cwd(), "uploads", "floorplans");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

customerSiteBuilderRouter.post(
  "/:customerCode/floors/upload",
  ...portalAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const body = req.body as {
      floorId?: string;
      fileName?: string;
      mimeType?: string;
      imageBase64?: string;
    };
    if (!body.floorId || !body.imageBase64) {
      res.status(400).json({ error: "floorId and imageBase64 required" });
      return;
    }
    const floor = getFloorById(body.floorId);
    if (!floor) {
      res.status(404).json({ error: "Floor not found" });
      return;
    }
    const site = getSiteById(floor.site_id);
    if (!site || site.customer_id !== customer.customer_id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const ext = path.extname(body.fileName ?? ".png").toLowerCase() || ".png";
    if (!FLOOR_EXT.has(ext)) {
      res.status(400).json({ error: "Allowed: png, jpg, webp" });
      return;
    }
    if (body.mimeType && !FLOOR_MIME.has(body.mimeType)) {
      res.status(400).json({ error: "Invalid mime type" });
      return;
    }
    const buf = Buffer.from(body.imageBase64, "base64");
    if (buf.length > 8 * 1024 * 1024) {
      res.status(400).json({ error: "Max 8MB" });
      return;
    }
    const fname = `${body.floorId}-${uuid()}${ext}`;
    const full = path.join(floorUploadDir(), fname);
    fs.writeFileSync(full, buf);
    const rel = fname;
    updateFloor(body.floorId, { floorPlanPath: rel });
    const db = getDatabase();
    db.prepare(
      `INSERT INTO floor_maps (id, floor_id, image_path, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(floor_id) DO UPDATE SET image_path = excluded.image_path, updated_at = excluded.updated_at`
    ).run(uuid(), body.floorId, rel);
    res.status(201).json({ floorId: body.floorId, imageUrl: `/uploads/floorplans/${fname}`, path: rel });
  }
);

customerSiteBuilderRouter.get("/:customerCode/install", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  const devices = listDevicesForCustomer(customer.customer_id);
  const db = getDatabase();
  const enriched = devices.map((d) => {
    const row = db
      .prepare(
        `SELECT rssi, firmware_version, serial_number, last_seen, pos_x, pos_y, floor_id, zone_id FROM devices WHERE device_id = ? OR id = ? LIMIT 1`
      )
      .get(d.deviceId, d.deviceId) as {
      rssi: number | null;
      firmware_version: string | null;
      serial_number: string | null;
      last_seen: string | null;
      pos_x: number | null;
      pos_y: number | null;
      floor_id: string | null;
      zone_id: string | null;
    } | undefined;
    return {
      ...d,
      rssi: row?.rssi ?? null,
      firmwareVersion: row?.firmware_version ?? null,
      serialNumber: row?.serial_number ?? null,
      floorId: row?.floor_id ?? null,
      zoneId: row?.zone_id ?? null,
      mapPosition: row?.pos_x != null ? { x: row.pos_x, y: row.pos_y } : null,
    };
  });
  res.json({ installerMode: true, devices: enriched });
});

customerSiteBuilderRouter.post("/:customerCode/devices/wizard", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  const { serial, type, room, floor, icon, siteId } = req.body as {
    serial?: string;
    type?: string;
    room?: string;
    floor?: string;
    icon?: string;
    siteId?: string;
  };
  if (!serial || !type) {
    res.status(400).json({ error: "serial and type required" });
    return;
  }
  const db = getDatabase();
  const id = uuid();
  const now = new Date().toISOString();
  let zoneId: string | null = null;
  let floorId: string | null = null;
  if (siteId && room) {
    const z = createZone({ siteId, floorId: floor ?? undefined, name: room, type: "room" });
    zoneId = z.id;
    floorId = z.floor_id;
  }
  db.prepare(
    `INSERT INTO devices (id, customer_id, site_id, zone_id, floor_id, device_type, device_id, label, serial_number, icon_type, last_seen, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    customer.customer_id,
    siteId ?? null,
    zoneId,
    floorId ?? floor ?? null,
    type,
    serial,
    room ?? serial,
    serial,
    icon ?? type,
    now,
    now,
    now
  );
  res.status(201).json({ deviceId: serial, id, zoneId, floorId });
});

customerSiteBuilderRouter.get("/:customerCode/cameras", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  res.json({ cameras: listCamerasForCustomer(customer.customer_id) });
});

customerSiteBuilderRouter.post("/:customerCode/cameras", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  const { cameraName, rtspUrl, channel, cameraGroup, siteId, zoneId } = req.body as {
    cameraName?: string;
    rtspUrl?: string;
    channel?: number;
    cameraGroup?: string;
    siteId?: string;
    zoneId?: string;
  };
  if (!cameraName) {
    res.status(400).json({ error: "cameraName required" });
    return;
  }
  res.status(201).json({
    camera: createCamera({
      customerId: customer.customer_id,
      cameraName,
      rtspUrl,
      channel,
      cameraGroup,
      siteId,
      zoneId,
    }),
  });
});

customerSiteBuilderRouter.patch("/:customerCode/cameras/:id", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  const cam = updateCamera(customer.customer_id, String(req.params.id), req.body);
  if (!cam) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ camera: cam });
});

customerSiteBuilderRouter.get("/:customerCode/schedules", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  res.json({ schedules: listSchedules(customer.customer_id) });
});

customerSiteBuilderRouter.post("/:customerCode/schedules", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  const { name, mode, siteId, timeStart, timeEnd, daysOfWeek, cronExpr } = req.body as {
    name?: string;
    mode?: "armed" | "disarmed" | "business" | "night";
    siteId?: string;
    timeStart?: string;
    timeEnd?: string;
    daysOfWeek?: number[];
    cronExpr?: string;
  };
  if (!name || !mode) {
    res.status(400).json({ error: "name and mode required" });
    return;
  }
  res.status(201).json({
    schedule: createSchedule({
      customerId: customer.customer_id,
      name,
      mode,
      siteId,
      timeStart,
      timeEnd,
      daysOfWeek,
      cronExpr,
    }),
  });
});

customerSiteBuilderRouter.get("/:customerCode/recovery-rules", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  res.json({ rules: listCustomerRecoveryRules(customer.customer_id) });
});

customerSiteBuilderRouter.post("/:customerCode/recovery-rules", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  const { name, conditionType, conditionDeviceType, actionType, actionTarget } = req.body as {
    name?: string;
    conditionType?: string;
    conditionDeviceType?: string;
    actionType?: string;
    actionTarget?: string;
  };
  if (!name || !conditionType || !actionType) {
    res.status(400).json({ error: "name, conditionType, actionType required" });
    return;
  }
  res.status(201).json({
    rule: createCustomerRecoveryRule({
      customerId: customer.customer_id,
      name,
      conditionType,
      conditionDeviceType,
      actionType,
      actionTarget,
    }),
  });
});

customerSiteBuilderRouter.patch(
  "/:customerCode/recovery-rules/:id",
  ...portalAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const rule = updateCustomerRecoveryRule(customer.customer_id, String(req.params.id), {
      name: req.body.name,
      conditionType: req.body.conditionType,
      conditionDeviceType: req.body.conditionDeviceType,
      actionType: req.body.actionType,
      actionTarget: req.body.actionTarget,
      enabled: req.body.enabled,
      priority: req.body.priority,
    });
    if (!rule) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ rule });
  }
);

customerSiteBuilderRouter.delete(
  "/:customerCode/recovery-rules/:id",
  ...portalAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    deleteCustomerRecoveryRule(customer.customer_id, String(req.params.id));
    res.json({ ok: true });
  }
);

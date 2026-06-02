import { createHash, randomBytes } from "crypto";
import { v4 as uuid } from "uuid";
import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { logAudit } from "./audit-log.js";
import { getTemplate, type SiteTemplateId } from "./site-templates.js";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || `site-${Date.now()}`;
}

export interface CreateSiteInput {
  name: string;
  tenantId?: string;
  templateId?: SiteTemplateId | string;
  address?: string;
  lat?: number;
  lng?: number;
  actorId?: string;
  actorLabel?: string;
}

export interface ProvisionedSite {
  site: {
    id: string;
    tenantId: string;
    name: string;
    templateId: string | null;
    siteType: string | null;
    dashboard: Record<string, unknown>;
  };
  zones: Array<{ id: string; name: string; zoneType: string | null }>;
  devices: Array<{ id: string; deviceId: string; label: string; zoneId: string | null }>;
}

export function ensureTenant(tenantId: string, name?: string): void {
  const db = getDatabase();
  const existing = db.prepare("SELECT id FROM tenants WHERE id = ?").get(tenantId);
  if (!existing) {
    db.prepare(
      `INSERT INTO tenants (id, name, slug) VALUES (?, ?, ?)`
    ).run(tenantId, name ?? tenantId, tenantId);
  }
}

export function createSite(input: CreateSiteInput): ProvisionedSite {
  const tenantId = input.tenantId ?? config.defaultTenantId;
  ensureTenant(tenantId);

  const template = input.templateId ? getTemplate(input.templateId) : undefined;
  const siteSlug = slugify(input.name);
  const siteId = `site-${siteSlug}-${randomBytes(3).toString("hex")}`;

  const dashboard = template?.dashboard ?? {
    layout: "default",
    widgets: ["alarms", "events", "devices"],
  };

  const db = getDatabase();
  db.prepare(
    `INSERT INTO sites (id, tenant_id, name, template_id, site_type, address, lat, lng, dashboard_json, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
  ).run(
    siteId,
    tenantId,
    input.name,
    template?.id ?? null,
    template?.siteType ?? "custom",
    input.address ?? null,
    input.lat ?? null,
    input.lng ?? null,
    JSON.stringify(dashboard)
  );

  const zoneMap = new Map<string, string>();
  const zones: ProvisionedSite["zones"] = [];

  const zoneDefs = template?.zones ?? [{ name: "デフォルト", zoneType: "default" }];
  zoneDefs.forEach((z, i) => {
    const zoneId = `${siteId}-zone-${i}`;
    db.prepare(
      `INSERT INTO zones (id, site_id, name, zone_type, sort_order) VALUES (?, ?, ?, ?, ?)`
    ).run(zoneId, siteId, z.name, z.zoneType, i);
    zoneMap.set(z.name, zoneId);
    zones.push({ id: zoneId, name: z.name, zoneType: z.zoneType });
  });

  const defaultZoneId = zones[0]?.id ?? null;
  const devices: ProvisionedSite["devices"] = [];
  const deviceDefs = template?.devices ?? [];

  for (const d of deviceDefs) {
    const zoneId = zoneMap.get(d.zoneName) ?? defaultZoneId;
    const deviceId = `${siteId}-${d.suffix}`;
    const devUuid = uuid();
    const meta = {
      tenant_id: tenantId,
      site_id: siteId,
      zone_id: zoneId,
      zone_name: d.zoneName,
      source_type: d.kind,
      provisioned: true,
      integration_phase: "141-160-rc1",
    };
    db.prepare(
      `INSERT INTO devices (id, device_type, platform, device_id, label, metadata_json, heartbeat_status)
       VALUES (?, ?, ?, ?, ?, ?, 'unknown')`
    ).run(
      devUuid,
      d.kind,
      d.platform,
      deviceId,
      `${d.labelPrefix} — ${input.name}`,
      JSON.stringify(meta)
    );
    devices.push({ id: devUuid, deviceId, label: `${d.labelPrefix} — ${input.name}`, zoneId });
  }

  logAudit({
    tenantId,
    siteId,
    actorId: input.actorId,
    actorLabel: input.actorLabel ?? "Operator",
    action: "site.create",
    entityType: "site",
    entityId: siteId,
    details: { name: input.name, templateId: template?.id, zoneCount: zones.length, deviceCount: devices.length },
  });

  return {
    site: {
      id: siteId,
      tenantId,
      name: input.name,
      templateId: template?.id ?? null,
      siteType: template?.siteType ?? "custom",
      dashboard,
    },
    zones,
    devices,
  };
}

export function listSites(tenantId?: string) {
  const db = getDatabase();
  let sql = "SELECT * FROM sites";
  const params: unknown[] = [];
  if (tenantId) {
    sql += " WHERE tenant_id = ?";
    params.push(tenantId);
  }
  sql += " ORDER BY created_at DESC";
  const rows = db.prepare(sql).all(...params) as Array<{
    id: string;
    tenant_id: string;
    name: string;
    template_id: string | null;
    site_type: string | null;
    address: string | null;
    status: string;
    dashboard_json: string | null;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    templateId: r.template_id,
    siteType: r.site_type,
    address: r.address,
    status: r.status,
    dashboard: r.dashboard_json ? JSON.parse(r.dashboard_json) : {},
    createdAt: r.created_at,
  }));
}

export function getSiteDetail(siteId: string) {
  const db = getDatabase();
  const site = db.prepare("SELECT * FROM sites WHERE id = ?").get(siteId) as
    | Record<string, unknown>
    | undefined;
  if (!site) return null;
  const zones = db
    .prepare("SELECT id, name, zone_type, sort_order FROM zones WHERE site_id = ? ORDER BY sort_order")
    .all(siteId);
  const devices = db
    .prepare("SELECT id, device_id, label, device_type, platform, metadata_json FROM devices")
    .all() as Array<{ metadata_json: string | null } & Record<string, unknown>>;
  const siteDevices = devices.filter((d) => {
    if (!d.metadata_json) return false;
    try {
      const m = JSON.parse(d.metadata_json as string);
      return m.site_id === siteId;
    } catch {
      return false;
    }
  });
  return {
    id: site.id,
    tenantId: site.tenant_id,
    name: site.name,
    templateId: site.template_id,
    siteType: site.site_type,
    address: site.address,
    status: site.status,
    dashboard: site.dashboard_json ? JSON.parse(site.dashboard_json as string) : {},
    zones,
    devices: siteDevices,
    createdAt: site.created_at,
  };
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

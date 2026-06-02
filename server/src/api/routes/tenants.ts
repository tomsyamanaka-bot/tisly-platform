import { Router } from "express";
import { v4 as uuid } from "uuid";
import { config } from "../../config.js";
import { getDatabase } from "../../db/database.js";
import { ensureTenant } from "../../provisioning/site-provisioner.js";
import { logAudit } from "../../provisioning/audit-log.js";

export const tenantsRouter = Router();

tenantsRouter.get("/", (_req, res) => {
  const db = getDatabase();
  const rows = db
    .prepare("SELECT id, name, slug, created_at FROM tenants ORDER BY name")
    .all();
  if (!rows.length) {
    ensureTenant(config.defaultTenantId, "Default Tenant");
    const fallback = db
      .prepare("SELECT id, name, slug, created_at FROM tenants ORDER BY name")
      .all();
    res.json({ tenants: fallback, defaultTenantId: config.defaultTenantId });
    return;
  }
  res.json({ tenants: rows, defaultTenantId: config.defaultTenantId });
});

tenantsRouter.post("/", (req, res) => {
  const { name, slug } = req.body;
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const id = slug ?? `tenant-${uuid().slice(0, 8)}`;
  ensureTenant(id, name);
  logAudit({
    tenantId: id,
    action: "tenant.create",
    entityType: "tenant",
    entityId: id,
    details: { name },
  });
  res.status(201).json({ ok: true, id, name });
});

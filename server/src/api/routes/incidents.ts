import { Router } from "express";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../../db/database.js";
import { getCustomerByCode, listCustomers } from "../../customer/customer-store.js";
import { requireAdminAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { logAudit } from "../../provisioning/audit-log.js";

export const incidentsRouter = Router();

export type IncidentStatus = "open" | "acknowledged" | "escalated" | "resolved" | "closed";
export type IncidentSeverity = "info" | "warning" | "alarm" | "critical";

export interface SocIncident {
  id: string;
  device_id: string;
  site_id: string | null;
  customer_id: string | null;
  tenant_id: string | null;
  status: IncidentStatus;
  severity: IncidentSeverity;
  title: string | null;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
}

function customerScopeFilter(customerCode: string | undefined): {
  sql: string;
  params: string[];
} {
  if (!customerCode || customerCode === "ALL") {
    return { sql: "1=1", params: [] };
  }
  const customer = getCustomerByCode(customerCode);
  if (!customer) return { sql: "1=0", params: [] };
  return {
    sql: "(customer_id = ? OR tenant_id = ?)",
    params: [customer.customer_id, customer.tenant_id ?? customer.customer_id],
  };
}

function ensureDemoIncidents(): void {
  const marker = getDatabase()
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:soc_incidents_demo") as { value_json: string } | undefined;
  if (marker) return;

  const customers = listCustomers(false).filter((c) =>
    ["TOMS001", "HOTEL001", "PLANT001"].includes(c.customer_code)
  );
  for (const c of customers) {
    const id = uuid();
    getDatabase()
      .prepare(
        `INSERT INTO incidents (id, device_id, site_id, status, severity, title, customer_id, tenant_id, opened_at, created_at)
         VALUES (?, ?, ?, 'open', ?, ?, ?, ?, datetime('now'), datetime('now'))`
      )
      .run(
        id,
        `demo-device-${c.customer_code.toLowerCase()}`,
        null,
        c.customer_code === "TOMS001" ? "critical" : c.customer_code === "HOTEL001" ? "alarm" : "warning",
        `Demo incident — ${c.customer_name}`,
        c.customer_id,
        c.tenant_id ?? c.customer_id
      );
  }
  try {
    getDatabase()
      .prepare(
        `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
      )
      .run("migration:soc_incidents_demo", JSON.stringify({ at: new Date().toISOString() }));
  } catch {
    /* platform_settings optional */
  }
}

incidentsRouter.use(requireAdminAuth);

incidentsRouter.get("/", (req: AuthedRequest, res) => {
  ensureDemoIncidents();
  const customerCode = String(req.query.customerCode ?? req.query.customer ?? "ALL");
  const scope = customerScopeFilter(customerCode);
  const status = req.query.status as string | undefined;

  let sql = `SELECT id, device_id, site_id, customer_id, tenant_id, status, severity, title, opened_at, closed_at, created_at
             FROM incidents WHERE ${scope.sql}`;
  const params = [...scope.params];
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  sql += " ORDER BY created_at DESC LIMIT 100";

  let rows: SocIncident[] = [];
  try {
    rows = getDatabase().prepare(sql).all(...params) as SocIncident[];
  } catch {
    rows = [];
  }
  res.json({ incidents: rows, customerScope: customerCode });
});

incidentsRouter.get("/:id", (req, res) => {
  const row = getDatabase()
    .prepare(
      `SELECT id, device_id, site_id, customer_id, tenant_id, status, severity, title, opened_at, closed_at, created_at
       FROM incidents WHERE id = ?`
    )
    .get(req.params.id) as SocIncident | undefined;
  if (!row) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }
  let timeline: unknown[] = [];
  try {
    timeline = getDatabase()
      .prepare(
        `SELECT id, phase, title, detail, created_at FROM incident_timeline WHERE incident_id = ? ORDER BY created_at`
      )
      .all(req.params.id);
  } catch {
    timeline = [];
  }
  res.json({ incident: row, timeline });
});

function updateIncidentStatus(
  id: string,
  status: IncidentStatus,
  actor: { userId: string; username: string },
  ip?: string
): boolean {
  const extra =
    status === "closed" || status === "resolved"
      ? ", closed_at = datetime('now')"
      : "";
  const r = getDatabase()
    .prepare(`UPDATE incidents SET status = ?${extra} WHERE id = ?`)
    .run(status, id);
  if (r.changes === 0) return false;

  const row = getDatabase()
    .prepare(`SELECT customer_id FROM incidents WHERE id = ?`)
    .get(id) as { customer_id: string | null };
  logAudit({
    tenantId: row?.customer_id ?? undefined,
    userId: actor.userId,
    actorLabel: actor.username,
    action: `incident.${status}`,
    targetType: "incident",
    targetId: id,
    ipAddress: ip,
  });
  return true;
}

incidentsRouter.post("/:id/ack", (req: AuthedRequest, res) => {
  const ok = updateIncidentStatus(
    String(req.params.id),
    "acknowledged",
    { userId: req.admin!.userId, username: req.admin!.username },
    req.ip
  );
  if (!ok) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true, status: "acknowledged" });
});

incidentsRouter.post("/:id/close", (req: AuthedRequest, res) => {
  const ok = updateIncidentStatus(
    String(req.params.id),
    "closed",
    { userId: req.admin!.userId, username: req.admin!.username },
    req.ip
  );
  if (!ok) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true, status: "closed" });
});

incidentsRouter.post("/:id/escalate", (req: AuthedRequest, res) => {
  const ok = updateIncidentStatus(
    String(req.params.id),
    "escalated",
    { userId: req.admin!.userId, username: req.admin!.username },
    req.ip
  );
  if (!ok) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true, status: "escalated" });
});

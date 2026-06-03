import { Router } from "express";
import { requireAdminAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import {
  ensureDemoIncidents,
  getIncidentById,
  listIncidents,
  scopeFromCustomerCode,
  updateIncidentStatus,
} from "../../incidents/incident-store.js";
import type { IncidentStatus } from "../../incidents/incident-status.js";
import { getDatabase } from "../../db/database.js";
import { resolveIncidentMapLocation } from "../../ops/map-builder.js";

export const incidentsRouter = Router();

incidentsRouter.use(requireAdminAuth);

incidentsRouter.get("/", (req: AuthedRequest, res) => {
  ensureDemoIncidents();
  const customerCode = String(req.query.customerCode ?? req.query.customer ?? "ALL");
  const scope = scopeFromCustomerCode(customerCode);
  if (scope === null) {
    res.json({ incidents: [], customerScope: customerCode });
    return;
  }
  const status = req.query.status as string | undefined;
  const incidents = listIncidents(scope, { status, limit: 100 });
  res.json({ incidents, customerScope: customerCode });
});

incidentsRouter.get("/:id", (req, res) => {
  const customerCode = String(req.query.customerCode ?? "ALL");
  const scope = scopeFromCustomerCode(customerCode);
  const row = getIncidentById(String(req.params.id), scope === null ? null : scope);
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
  const mapLocation = resolveIncidentMapLocation({
    device_id: (row as { device_id?: string }).device_id,
    floor_id: (row as { floor_id?: string }).floor_id,
    pos_x: (row as { pos_x?: number }).pos_x,
    pos_y: (row as { pos_y?: number }).pos_y,
    site_id: (row as { site_id?: string }).site_id,
  });
  res.json({ incident: row, timeline, mapLocation, mapJumpUrl: mapLocation.floorId
    ? `/customer/${customerCode}/map?floor=${mapLocation.floorId}&x=${mapLocation.x}&y=${mapLocation.y}`
    : null });
});

function act(
  req: AuthedRequest,
  res: import("express").Response,
  status: IncidentStatus
): void {
  const customerCode = String(req.query.customerCode ?? "ALL");
  const scope = scopeFromCustomerCode(customerCode);
  const ok = updateIncidentStatus(
    String(req.params.id),
    status,
    { userId: req.admin!.userId, username: req.admin!.username },
    scope === null ? null : scope,
    req.ip
  );
  if (!ok) {
    res.status(404).json({ error: "Not found or scope denied" });
    return;
  }
  res.json({ ok: true, status });
}

incidentsRouter.post("/:id/ack", (req: AuthedRequest, res) => act(req, res, "acknowledged"));
incidentsRouter.post("/:id/close", (req: AuthedRequest, res) => act(req, res, "closed"));
incidentsRouter.post("/:id/escalate", (req: AuthedRequest, res) => act(req, res, "escalated"));

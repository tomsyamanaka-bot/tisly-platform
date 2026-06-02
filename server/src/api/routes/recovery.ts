import { Router } from "express";
import { getRecoveryOverview, getPlaybook, getSlaMetrics } from "../../recovery/recovery-engine.js";
import { runDeviceRecovery } from "../../recovery/device-recovery.js";
import { getIncidentTimeline } from "../../recovery/incident-timeline.js";
import { executeRecoveryAction } from "../../recovery/recovery-actions.js";
import { getDatabase } from "../../db/database.js";

export const recoveryRouter = Router();

recoveryRouter.get("/overview", (_req, res) => {
  res.json({ phase: "81-100", ...getRecoveryOverview() });
});

recoveryRouter.get("/sla", (_req, res) => {
  const days = Number(_req.query.days ?? 30);
  res.json(getSlaMetrics(days));
});

recoveryRouter.get("/timeline", (req, res) => {
  const incidentId = req.query.incidentId as string | undefined;
  const limit = Number(req.query.limit ?? 50);
  res.json({ entries: getIncidentTimeline(incidentId, limit) });
});

recoveryRouter.get("/playbook/:eventType", (req, res) => {
  const pb = getPlaybook(req.params.eventType);
  if (!pb) {
    res.status(404).json({ error: "playbook not found" });
    return;
  }
  res.json(pb);
});

recoveryRouter.post("/run/:deviceId", async (req, res) => {
  try {
    const result = await runDeviceRecovery(req.params.deviceId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

recoveryRouter.get("/console", (_req, res) => {
  const db = getDatabase();
  const runs = db
    .prepare(
      `SELECT id, device_id, status, started_at, completed_at FROM recovery_runs ORDER BY started_at DESC LIMIT 30`
    )
    .all();
  const anomalies = db
    .prepare(
      `SELECT id, device_id, site_id, status, opened_at FROM incidents WHERE status != 'closed' ORDER BY opened_at DESC LIMIT 20`
    )
    .all();
  res.json({
    phase: "141-160-rc1",
    overview: getRecoveryOverview(),
    anomalies,
    recentRuns: runs,
    actions: ["restart_device", "restart_mqtt", "restart_node_red", "escalate"],
  });
});

recoveryRouter.post("/actions", async (req, res) => {
  try {
    const result = await executeRecoveryAction(req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

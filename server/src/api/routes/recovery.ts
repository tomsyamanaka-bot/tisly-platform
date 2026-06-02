import { Router } from "express";
import { getRecoveryOverview, getPlaybook, getSlaMetrics } from "../../recovery/recovery-engine.js";
import { runDeviceRecovery } from "../../recovery/device-recovery.js";
import { getIncidentTimeline } from "../../recovery/incident-timeline.js";

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

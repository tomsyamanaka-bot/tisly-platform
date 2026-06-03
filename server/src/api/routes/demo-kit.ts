import { Router } from "express";
import { buildTomsKpi } from "../../toms/toms-kpi.js";
import {
  ensureDemoKit,
  getDemoFloorMapStatus,
  getDemoPackStatus,
  hasDemoTimelineSeed,
  listDemoNotificationKinds,
  resetDemoKit,
  runDemoAiEstimateFlow,
  triggerDemoNotification,
  type DemoNotificationKind,
} from "../../demo-kit/index.js";

export const demoKitRouter = Router();

demoKitRouter.get("/status", (_req, res) => {
  res.json({
    phase: "821-860",
    customers: getDemoPackStatus(),
    floorMaps: getDemoFloorMapStatus(),
    timelineSeeded: hasDemoTimelineSeed(),
    notificationKinds: listDemoNotificationKinds(),
    kpi: buildTomsKpi(),
  });
});

demoKitRouter.post("/reset", (_req, res) => {
  try {
    const result = resetDemoKit();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

demoKitRouter.post("/ensure", (_req, res) => {
  const result = ensureDemoKit();
  res.json(result);
});

demoKitRouter.post("/notifications/:kind", async (req, res) => {
  const kind = String(req.params.kind) as DemoNotificationKind;
  const customerCode = String(req.body?.customerCode ?? req.query.customerCode ?? "TOMS001");
  if (!listDemoNotificationKinds().includes(kind)) {
    res.status(400).json({ error: "Unknown notification kind", kinds: listDemoNotificationKinds() });
    return;
  }
  try {
    const result = await triggerDemoNotification(kind, customerCode);
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

demoKitRouter.post("/ai-estimate", (req, res) => {
  const customerCode = String(req.body?.customerCode ?? "TOMS001");
  try {
    const result = runDemoAiEstimateFlow(customerCode);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

demoKitRouter.get("/kpi", (_req, res) => {
  res.json({ kpi: buildTomsKpi() });
});

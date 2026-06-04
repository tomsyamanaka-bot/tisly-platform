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
  exportDemoKpiCsv,
  estimateDispatchReductionJpy,
  buildDemoEstimateHtml,
  getDemoEstimateMeta,
  listDemoEstimateTypes,
  getDemoResetSchedule,
  setDemoResetSchedule,
  listDemoResetScheduleModes,
  runDemoShellyReboot,
  getDemoFloorPreview,
  type DemoNotificationKind,
  type DemoEstimateType,
  type DemoResetScheduleMode,
} from "../../demo-kit/index.js";

export const demoKitRouter = Router();

demoKitRouter.get("/status", (_req, res) => {
  const kpi = buildTomsKpi();
  res.json({
    phase: "861-900",
    customers: getDemoPackStatus(),
    floorMaps: getDemoFloorMapStatus(),
    timelineSeeded: hasDemoTimelineSeed(),
    notificationKinds: listDemoNotificationKinds(),
    estimateTypes: listDemoEstimateTypes(),
    resetSchedule: getDemoResetSchedule(),
    kpi: {
      ...kpi,
      dispatchReductionEstimate: estimateDispatchReductionJpy(kpi.anomalyCount),
    },
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

demoKitRouter.post("/shelly-reboot", (req, res) => {
  const customerCode = String(req.body?.customerCode ?? "TOMS001");
  try {
    const result = runDemoShellyReboot(customerCode);
    res.json(result);
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
  const kpi = buildTomsKpi();
  res.json({
    kpi: { ...kpi, dispatchReductionEstimate: estimateDispatchReductionJpy(kpi.anomalyCount) },
  });
});

demoKitRouter.get("/kpi/csv", (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="demo-kpi.csv"');
  res.send(exportDemoKpiCsv());
});

demoKitRouter.get("/floor-preview/:customerCode", (req, res) => {
  try {
    const data = getDemoFloorPreview(String(req.params.customerCode));
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

demoKitRouter.get("/estimates", (_req, res) => {
  res.json({ types: listDemoEstimateTypes().map((t) => getDemoEstimateMeta(t)) });
});

demoKitRouter.get("/estimate-html/:type", (req, res) => {
  const type = String(req.params.type) as DemoEstimateType;
  if (!listDemoEstimateTypes().includes(type)) {
    res.status(400).json({ error: "Unknown estimate type", types: listDemoEstimateTypes() });
    return;
  }
  res.type("html").send(buildDemoEstimateHtml(type));
});

demoKitRouter.get("/reset-schedule", (_req, res) => {
  res.json(getDemoResetSchedule());
});

demoKitRouter.put("/reset-schedule", (req, res) => {
  const body = req.body as { mode?: DemoResetScheduleMode; enabled?: boolean };
  if (body.mode && !listDemoResetScheduleModes().includes(body.mode)) {
    res.status(400).json({ error: "Invalid mode", modes: listDemoResetScheduleModes() });
    return;
  }
  res.json(setDemoResetSchedule(body));
});

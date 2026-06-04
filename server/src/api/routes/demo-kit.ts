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
  getProRemoteLiveFloorPreview,
  getDeviceMode,
  setDeviceMode,
  DEVICE_MODES,
  getDeviceAdapterStatus,
  getDeviceRegistry,
  listShellyBridgeConfigs,
  upsertShellyBridgeConfig,
  fetchShellyTelemetry,
  pollShellyDevices,
  getEspHeartbeatKpi,
  listDemoPackages,
  launchDemoPackage,
  calculateRoiV2,
  startDemoMovie,
  stopDemoMovie,
  getDemoMovieStatus,
  type DemoNotificationKind,
  type DemoEstimateType,
  type DemoResetScheduleMode,
  type DeviceMode,
  type DemoPackageType,
  DEMO_PACKAGE_TYPES,
  getSalesLiveBadge,
  broadcastSalesDemoEvent,
} from "../../demo-kit/index.js";

export const demoKitRouter = Router();

demoKitRouter.get("/status", (_req, res) => {
  const kpi = buildTomsKpi();
  const adapter = getDeviceAdapterStatus();
  res.json({
    phase: "941-980",
    liveBadge: getSalesLiveBadge(),
    deviceMode: adapter.deviceMode,
    deviceBridge: adapter,
    espHeartbeat: getEspHeartbeatKpi(),
    customers: getDemoPackStatus(),
    floorMaps: getDemoFloorMapStatus(),
    timelineSeeded: hasDemoTimelineSeed(),
    notificationKinds: listDemoNotificationKinds(),
    estimateTypes: listDemoEstimateTypes(),
    resetSchedule: getDemoResetSchedule(),
    demoPackages: listDemoPackages(),
    demoMovie: getDemoMovieStatus(),
    kpi: {
      ...kpi,
      dispatchReductionEstimate: estimateDispatchReductionJpy(kpi.anomalyCount),
    },
  });
});

demoKitRouter.get("/device-mode", (_req, res) => {
  res.json({ deviceMode: getDeviceMode(), modes: DEVICE_MODES, bridge: getDeviceAdapterStatus() });
});

demoKitRouter.put("/device-mode", (req, res) => {
  const mode = String(req.body?.deviceMode ?? req.body?.mode) as DeviceMode;
  if (!DEVICE_MODES.includes(mode)) {
    res.status(400).json({ error: "Invalid device mode", modes: DEVICE_MODES });
    return;
  }
  const deviceMode = setDeviceMode(mode);
  broadcastSalesDemoEvent("device_mode", { deviceMode });
  res.json({ deviceMode, bridge: getDeviceAdapterStatus() });
});

demoKitRouter.get("/devices/registry", (req, res) => {
  const customerCode = req.query.customerCode ? String(req.query.customerCode) : undefined;
  res.json(getDeviceRegistry(customerCode));
});

demoKitRouter.get("/shelly/configs", (_req, res) => {
  res.json({ configs: listShellyBridgeConfigs() });
});

demoKitRouter.put("/shelly/config", (req, res) => {
  const { deviceId, ip, name, location, enabled } = req.body ?? {};
  if (!deviceId || !ip || !name) {
    res.status(400).json({ error: "deviceId, ip, name required" });
    return;
  }
  try {
    const cfg = upsertShellyBridgeConfig({ deviceId: String(deviceId), ip: String(ip), name: String(name), location: location ? String(location) : "", enabled });
    res.json(cfg);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

demoKitRouter.get("/shelly/telemetry/:deviceId", (req, res) => {
  const tel = fetchShellyTelemetry(String(req.params.deviceId));
  if (!tel) {
    res.status(404).json({ error: "No telemetry" });
    return;
  }
  res.json(tel);
});

demoKitRouter.post("/shelly/poll", async (_req, res) => {
  const results = await pollShellyDevices();
  res.json({ polled: results.length, results });
});

demoKitRouter.get("/esp-heartbeat/kpi", (_req, res) => {
  res.json(getEspHeartbeatKpi());
});

demoKitRouter.get("/floor-preview-live/:customerCode", (req, res) => {
  try {
    res.json(getProRemoteLiveFloorPreview(String(req.params.customerCode)));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

demoKitRouter.get("/demo-packages", (_req, res) => {
  res.json({ packages: listDemoPackages() });
});

demoKitRouter.post("/demo-packages/:type/launch", async (req, res) => {
  const type = String(req.params.type) as DemoPackageType;
  if (!DEMO_PACKAGE_TYPES.includes(type)) {
    res.status(400).json({ error: "Unknown package", types: DEMO_PACKAGE_TYPES });
    return;
  }
  try {
    const result = await launchDemoPackage(type);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

demoKitRouter.post("/roi-simulator", (req, res) => {
  res.json(calculateRoiV2(req.body ?? {}));
});

demoKitRouter.get("/demo-movie", (_req, res) => {
  res.json(getDemoMovieStatus());
});

demoKitRouter.post("/demo-movie/start", (req, res) => {
  const customerCode = String(req.body?.customerCode ?? "TOMS001");
  const intervalMs = Number(req.body?.intervalMs ?? 8000);
  res.json(startDemoMovie(customerCode, intervalMs));
});

demoKitRouter.post("/demo-movie/stop", (_req, res) => {
  stopDemoMovie();
  res.json(getDemoMovieStatus());
});

demoKitRouter.post("/reset", (_req, res) => {
  try {
    const result = resetDemoKit();
    broadcastSalesDemoEvent("reset", { at: result.at });
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

demoKitRouter.put("/reset-schedule", async (req, res) => {
  const body = req.body as { mode?: DemoResetScheduleMode; enabled?: boolean };
  if (body.mode && !listDemoResetScheduleModes().includes(body.mode)) {
    res.status(400).json({ error: "Invalid mode", modes: listDemoResetScheduleModes() });
    return;
  }
  const result = setDemoResetSchedule(body);
  const { refreshDemoResetCron } = await import("../../demo-kit/demo-reset-cron.js");
  refreshDemoResetCron();
  res.json(result);
});

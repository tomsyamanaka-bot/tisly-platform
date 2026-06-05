import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { buildProjectDashboard } from "../../toms/project-dashboard.js";
import { buildProjectDashboardRc } from "../../toms/project-dashboard-rc.js";
import { listProjectTimeline, appendProjectTimeline } from "../../toms/project-timeline.js";
import {
  getTomsWorkflowState,
  listWorkflowHistory,
  transitionTomsWorkflow,
  businessStatusToToms,
} from "../../toms/workflow-engine.js";
import { unifiedSearch } from "../../toms/unified-search.js";
import {
  listCustomerMaster,
  getCustomerMaster,
  upsertCustomerMaster,
} from "../../toms/customer-master.js";
import { createAsset, getAsset, listAssets, listProjectAssets } from "../../toms/asset-master.js";
import {
  generateAssetQrPng,
  resolveAssetFromQr,
  recordQrScan,
} from "../../toms/qr-management.js";
import { saveConstructionPhoto, listConstructionPhotos } from "../../toms/construction-photos.js";
import { createDrawingVersion, listDrawingVersions } from "../../toms/drawing-versions.js";
import { generateAiEstimateV3, getLatestAiEstimateV3 } from "../../toms/ai-estimate-v3.js";
import { buildTomsKpi } from "../../toms/toms-kpi.js";
import { dispatchTomsPushAlerts } from "../../toms/toms-push.js";
import { buildHubOperations } from "../../toms/hub-operations.js";
import { getBusinessProject } from "../../business/business-store.js";
import { TOMS_WORKFLOW_STATES } from "../../toms/toms-types.js";
import { listProjectLiveDevices } from "../../toms/realtime-devices.js";
import {
  listProjectNotifications,
  acknowledgeProjectNotification,
} from "../../toms/project-notifications.js";
import {
  listProjectMaintenance,
  createProjectMaintenance,
  closeProjectMaintenance,
} from "../../toms/maintenance-flow.js";
import { compareDrawingVersions } from "../../toms/drawing-diff.js";
import { buildProjectFloorStack } from "../../toms/floor-stack-project.js";
import {
  listIntegrationRetryQueue,
  retryIntegrationQueueItem,
  cancelIntegrationRetry,
  getIntegrationRetryLog,
} from "../../business/integration-retry-queue.js";
import { saveAiEstimateFeedback, listAiEstimateFeedback } from "../../toms/ai-estimate-feedback.js";
import { runAiFeedbackWeeklyBatch } from "../../toms/ai-feedback-weekly-batch.js";
import { getWsClientCount } from "../../ws/hub.js";
import { buildLiveConnectionStatus } from "../../toms/live-connection-status.js";
import {
  isLiveOpsMockPushEnabled,
  getMqttBridgeCertStatus,
  isMqttMockMode,
  listMqttBridgeLogs,
} from "../../toms/mqtt-live-push-bridge.js";
import { stopLiveOperationsMockPush } from "../../toms/live-push-mock.js";
import { isLiveOpsMockPushRunning } from "../../toms/live-push-mock-control.js";
import { buildHubOfflineSnapshot } from "../../toms/hub-offline-snapshot.js";
import {
  aggregateAiFeedbackLearning,
  buildAiLearningCandidateHints,
} from "../../toms/ai-feedback-learning.js";
import { exportTomsKpiCsv, exportCustomerKpiCsv } from "../../toms/toms-kpi-csv.js";
import { listGmailSendQueue } from "../../business/gmail-send-queue.js";

export const tomsRouter = Router();

tomsRouter.use(requireAuth("viewer"));

tomsRouter.get("/search", (req, res) => {
  const q = String(req.query.q ?? "");
  res.json({ query: q, hits: unifiedSearch(q) });
});

tomsRouter.get("/kpi", (_req, res) => {
  res.json(buildTomsKpi());
});

tomsRouter.get("/kpi/csv", (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="toms-kpi.csv"');
  res.send(exportTomsKpiCsv());
});

tomsRouter.get("/customer-master/:customerId/kpi/csv", (req, res) => {
  const csv = exportCustomerKpiCsv(String(req.params.customerId));
  if (!csv) {
    res.status(404).json({ error: "customer kpi not found" });
    return;
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="kpi-${req.params.customerId}.csv"`
  );
  res.send(csv);
});

tomsRouter.get("/hub/operations", (req: AuthedRequest, res) => {
  const code = (req.admin?.customerCode ?? "TOMS001").toUpperCase();
  res.json(buildHubOperations(code));
});

tomsRouter.get("/live/ws-status", (_req, res) => {
  res.json({
    path: "/ws",
    clients: getWsClientCount(),
    mockPush: isLiveOpsMockPushEnabled(),
    mockPushRunning: isLiveOpsMockPushRunning(),
    mqttMock: isMqttMockMode(),
    mqttReady: true,
  });
});

tomsRouter.get("/live/connection-status", (_req, res) => {
  res.json(buildLiveConnectionStatus());
});

tomsRouter.get("/live/mqtt-logs", (_req, res) => {
  res.json({ logs: listMqttBridgeLogs(50), certStatus: getMqttBridgeCertStatus() });
});

tomsRouter.post("/live/mock-push/stop", (_req, res) => {
  stopLiveOperationsMockPush();
  res.json({ ok: true, mockPushRunning: false });
});

tomsRouter.get("/hub/snapshot", (req: AuthedRequest, res) => {
  const code = (req.admin?.customerCode ?? "TOMS001").toUpperCase();
  res.json(buildHubOfflineSnapshot(code));
});

tomsRouter.post("/hub/snapshot/sync", (req: AuthedRequest, res) => {
  const code = (req.admin?.customerCode ?? "TOMS001").toUpperCase();
  const snapshot = buildHubOfflineSnapshot(code);
  res.json({ ok: true, snapshot, message: "snapshot ready for client IndexedDB" });
});

tomsRouter.get("/ai-feedback/learning", (req, res) => {
  const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
  res.json({
    stats: aggregateAiFeedbackLearning(projectId),
    hints: buildAiLearningCandidateHints(projectId),
  });
});

tomsRouter.get("/ai-feedback/weekly-batch", (_req, res) => {
  res.json(runAiFeedbackWeeklyBatch());
});

tomsRouter.get("/gmail-send-queue", (_req, res) => {
  res.json({ items: listGmailSendQueue({ limit: 30 }) });
});

tomsRouter.get("/projects/:projectId/retry-queue", (req, res) => {
  const projectId = String(req.params.projectId);
  if (!getBusinessProject(projectId)) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json({ items: listIntegrationRetryQueue({ projectId }) });
});

tomsRouter.post("/projects/:projectId/retry-queue/:itemId/retry", (req, res) => {
  const item = retryIntegrationQueueItem(String(req.params.itemId));
  if (!item) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ item });
});

tomsRouter.post("/projects/:projectId/retry-queue/:itemId/cancel", (req, res) => {
  const item = cancelIntegrationRetry(String(req.params.itemId));
  if (!item) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ item });
});

tomsRouter.get("/projects/:projectId/retry-queue/:itemId/log", (req, res) => {
  const item = getIntegrationRetryLog(String(req.params.itemId));
  if (!item) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ item });
});

tomsRouter.post("/projects/:projectId/ai-estimate-v3/feedback", (req, res) => {
  try {
    const record = saveAiEstimateFeedback({
      projectId: String(req.params.projectId),
      estimateV3Id: req.body.estimateV3Id,
      action: req.body.action,
      notes: req.body.notes,
      candidate: req.body.candidate,
    });
    res.status(201).json({ feedback: record });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

tomsRouter.get("/projects/:projectId/ai-estimate-v3/feedback", (req, res) => {
  res.json({ feedback: listAiEstimateFeedback(String(req.params.projectId)) });
});

tomsRouter.post("/push/dispatch", async (_req, res) => {
  const result = await dispatchTomsPushAlerts();
  res.json(result);
});

tomsRouter.get("/projects/:projectId/dashboard", (req, res) => {
  const useRc = req.query.rc === "1" || req.query.version === "rc";
  const projectId = String(req.params.projectId);
  const dash = useRc ? buildProjectDashboardRc(projectId) : buildProjectDashboard(projectId);
  if (!dash) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(dash);
});

tomsRouter.get("/projects/:projectId/devices/live", (req, res) => {
  const projectId = String(req.params.projectId);
  if (!getBusinessProject(projectId)) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json({ devices: listProjectLiveDevices(projectId) });
});

tomsRouter.get("/projects/:projectId/floor-stack", (req, res) => {
  const stack = buildProjectFloorStack(String(req.params.projectId));
  if (!stack) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(stack);
});

tomsRouter.get("/projects/:projectId/notifications", (req, res) => {
  const projectId = String(req.params.projectId);
  if (!getBusinessProject(projectId)) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json({ notifications: listProjectNotifications(projectId) });
});

tomsRouter.post(
  "/projects/:projectId/notifications/:notificationId/ack",
  (req: AuthedRequest, res) => {
    const n = acknowledgeProjectNotification(
      String(req.params.projectId),
      String(req.params.notificationId),
      req.admin?.username ?? "user"
    );
    if (!n) {
      res.status(404).json({ error: "notification not found" });
      return;
    }
    res.json({ notification: n });
  }
);

tomsRouter.get("/projects/:projectId/maintenance", (req, res) => {
  const projectId = String(req.params.projectId);
  if (!getBusinessProject(projectId)) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json({ cases: listProjectMaintenance(projectId) });
});

tomsRouter.post("/projects/:projectId/maintenance/create", (req, res) => {
  try {
    const c = createProjectMaintenance({
      projectId: String(req.params.projectId),
      scheduledDate: String(req.body.scheduledDate ?? new Date().toISOString().slice(0, 10)),
      content: req.body.content,
      targetDevices: req.body.targetDevices,
      photos: req.body.photos,
      assignee: req.body.assignee,
    });
    res.status(201).json({ case: c });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

tomsRouter.post("/projects/:projectId/maintenance/:caseId/close", (req: AuthedRequest, res) => {
  const c = closeProjectMaintenance(
    String(req.params.projectId),
    String(req.params.caseId),
    req.admin?.username
  );
  if (!c) {
    res.status(404).json({ error: "case not found" });
    return;
  }
  res.json({ case: c });
});

tomsRouter.get("/projects/:projectId/drawing-diff", (req, res) => {
  const projectId = String(req.params.projectId);
  if (!getBusinessProject(projectId)) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(compareDrawingVersions(projectId));
});

tomsRouter.get("/projects/:projectId/timeline", (req, res) => {
  res.json({ entries: listProjectTimeline(String(req.params.projectId)) });
});

tomsRouter.post("/projects/:projectId/timeline", (req: AuthedRequest, res) => {
  const entry = appendProjectTimeline({
    projectId: String(req.params.projectId),
    eventType: String(req.body.eventType ?? "pro_operations"),
    title: req.body.title,
    detail: req.body.detail,
    actor: req.admin?.username ?? "user",
    metadata: req.body.metadata,
  });
  res.status(201).json({ entry });
});

tomsRouter.get("/projects/:projectId/workflow", (req, res) => {
  const projectId = String(req.params.projectId);
  const project = getBusinessProject(projectId);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json({
    state: getTomsWorkflowState(projectId),
    businessStatus: project.status,
    allowedStates: TOMS_WORKFLOW_STATES,
    history: listWorkflowHistory(projectId),
  });
});

tomsRouter.post("/projects/:projectId/workflow/transition", (req: AuthedRequest, res) => {
  try {
    const result = transitionTomsWorkflow(String(req.params.projectId), req.body.to, {
      actor: req.admin?.username,
      note: req.body.note,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

tomsRouter.get("/projects/:projectId/workflow/toms-state", (req, res) => {
  const p = getBusinessProject(String(req.params.projectId));
  if (!p) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ tomsState: businessStatusToToms(p.status), businessStatus: p.status });
});

tomsRouter.post("/projects/:projectId/ai-estimate-v3", (req, res) => {
  try {
    res.status(201).json(generateAiEstimateV3(String(req.params.projectId)));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

tomsRouter.get("/projects/:projectId/ai-estimate-v3/latest", (req, res) => {
  const latest = getLatestAiEstimateV3(String(req.params.projectId));
  if (!latest) {
    res.status(404).json({ error: "no v3 estimate" });
    return;
  }
  res.json(latest);
});

tomsRouter.get("/projects/:projectId/construction-photos", (req, res) => {
  res.json({ photos: listConstructionPhotos(String(req.params.projectId)) });
});

tomsRouter.post("/projects/:projectId/construction-photos", (req, res) => {
  const b64 = String(req.body.dataBase64 ?? "");
  if (!b64) {
    res.status(400).json({ error: "dataBase64 required" });
    return;
  }
  const buf = Buffer.from(b64, "base64");
  const photo = saveConstructionPhoto({
    projectId: String(req.params.projectId),
    buffer: buf,
    originalName: String(req.body.filename ?? "photo.jpg"),
    caption: req.body.caption,
    category: req.body.category,
  });
  res.status(201).json({ photo });
});

tomsRouter.get("/projects/:projectId/drawing-versions", (req, res) => {
  res.json({ versions: listDrawingVersions(String(req.params.projectId)) });
});

tomsRouter.post("/projects/:projectId/drawing-versions", (req, res) => {
  const version = createDrawingVersion({
    projectId: String(req.params.projectId),
    versionKind: req.body.versionKind,
    title: String(req.body.title ?? "図面"),
    filePath: req.body.filePath,
    drawingPlanId: req.body.drawingPlanId,
    notes: req.body.notes,
    devices: req.body.devices,
  });
  res.status(201).json({ version });
});

tomsRouter.get("/customer-master", (_req, res) => {
  res.json({ customers: listCustomerMaster() });
});

tomsRouter.get("/customer-master/:id", (req, res) => {
  const detail = getCustomerMaster(String(req.params.id));
  if (!detail) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(detail);
});

tomsRouter.post("/customer-master", (req, res) => {
  const row = upsertCustomerMaster(req.body);
  res.status(201).json({ customer: row });
});

tomsRouter.get("/assets", (_req, res) => {
  res.json({ assets: listAssets() });
});

tomsRouter.post("/assets", (req, res) => {
  const asset = createAsset(req.body);
  res.status(201).json({ asset });
});

tomsRouter.get("/projects/:projectId/assets", (req, res) => {
  res.json({ assets: listProjectAssets(String(req.params.projectId)) });
});

tomsRouter.get("/assets/:assetId", (req, res) => {
  const asset = getAsset(String(req.params.assetId));
  if (!asset) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ asset });
});

tomsRouter.get("/assets/:assetId/qr.png", async (req, res) => {
  try {
    const base = `${req.protocol}://${req.get("host")}`;
    const png = await generateAssetQrPng(String(req.params.assetId), base);
    res.type("image/png").send(png);
  } catch (e) {
    res.status(404).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

tomsRouter.get("/assets/qr/:token", (req, res) => {
  const page = resolveAssetFromQr(String(req.params.token));
  if (!page) {
    res.status(404).json({ error: "invalid qr" });
    return;
  }
  recordQrScan(page.asset.id);
  res.json(page);
});

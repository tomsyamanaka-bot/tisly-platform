import { Router } from "express";
import { emitDemoEvent } from "../../demo/demo-generator.js";
import {
  ackMonitoringLogV1,
  buildMonitoringCustomerLinksV1,
  buildMonitoringDashboardV1,
  listMonitoringLogsV1,
} from "../../monitoring/tisly-monitoring-dashboard-v1.js";
import {
  buildMonitoring3dSceneV1,
  findMonitoring3dCameraV1,
  findMonitoring3dSensorV1,
} from "../../monitoring/tisly-monitoring-3d-v3.js";
import {
  findMonitoringDeviceV1,
  getMonitoringLayoutSiteV1,
  resolveMonitoringSiteIdV1,
} from "../../monitoring/tisly-monitoring-layout-v1.js";

export const tislyMonitoringV1Router = Router();

tislyMonitoringV1Router.get("/3d-scene", (req, res) => {
  const siteId = resolveMonitoringSiteIdV1(req.query.siteId as string | undefined);
  res.json(buildMonitoring3dSceneV1(siteId));
});

tislyMonitoringV1Router.get("/3d-sensor/:sensorId", (req, res) => {
  const sensor = findMonitoring3dSensorV1(req.params.sensorId ?? "");
  if (!sensor) {
    res.status(404).json({ error: "Sensor not found" });
    return;
  }
  const links = buildMonitoringCustomerLinksV1(
    resolveMonitoringSiteIdV1(req.query.siteId as string | undefined),
    sensor.sensorId
  );
  res.json({
    sensor,
    relatedKnowledgeIds: sensor.relatedKnowledgeIds,
    knowledgeLinks: links,
    camera: sensor.cameraId ? findMonitoring3dCameraV1(sensor.cameraId) ?? null : null,
  });
});

tislyMonitoringV1Router.get("/dashboard", (req, res) => {
  const siteId = resolveMonitoringSiteIdV1(req.query.siteId as string | undefined);
  res.json(buildMonitoringDashboardV1(siteId));
});

tislyMonitoringV1Router.get("/layout", (req, res) => {
  const siteId = resolveMonitoringSiteIdV1(req.query.siteId as string | undefined);
  res.json({ site: getMonitoringLayoutSiteV1(siteId) });
});

tislyMonitoringV1Router.get("/logs", (req, res) => {
  const siteId = resolveMonitoringSiteIdV1(req.query.siteId as string | undefined);
  const filter = (req.query.filter as "all" | "alarm" | "info" | "acked") ?? "all";
  const limit = Math.min(Number(req.query.limit ?? 80), 200);
  res.json({ logs: listMonitoringLogsV1(siteId, filter, limit) });
});

tislyMonitoringV1Router.post("/ack/:logId", (req, res) => {
  const ok = ackMonitoringLogV1(req.params.logId ?? "");
  res.json({ ok });
});

tislyMonitoringV1Router.get("/customer-links", (req, res) => {
  const siteId = resolveMonitoringSiteIdV1(req.query.siteId as string | undefined);
  const deviceId = String(req.query.deviceId ?? "");
  const dev = findMonitoringDeviceV1(siteId, deviceId);
  res.json({
    deviceId,
    deviceName: dev?.deviceName ?? null,
    links: buildMonitoringCustomerLinksV1(siteId, deviceId),
  });
});

tislyMonitoringV1Router.post("/test-alert", async (req, res) => {
  const siteId = resolveMonitoringSiteIdV1(req.body?.siteId ?? req.query.siteId);
  const floorId = String(req.body?.floorId ?? "1f");
  const site = getMonitoringLayoutSiteV1(siteId);
  const floor = site.floors.find((f) => f.floorId === floorId) ?? site.floors[1];
  const device = floor?.devices[0];
  if (!device) {
    res.status(400).json({ error: "No device on floor" });
    return;
  }
  await emitDemoEvent({
    event_id: `test-${Date.now()}`,
    tenant_id: "default",
    site_id: siteId,
    device_id: device.deviceId,
    source_type: "system",
    event_type: floorId === "perimeter" ? "camera_motion" : "intrusion",
    severity: floorId === "perimeter" ? "warning" : "alarm",
    zone: device.areaName,
    message: `${device.areaName} — ${floorId === "perimeter" ? "動体検知" : "侵入検知"}`,
    payload: { demo: true, monitoringTest: true },
    created_at: new Date().toISOString(),
  });
  res.status(201).json({
    ok: true,
    dashboard: buildMonitoringDashboardV1(siteId),
  });
});

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
import {
  listMonitoringDeviceLayoutOverridesV1,
  saveMonitoringDeviceLayoutOverrideV1,
} from "../../monitoring/monitoring-device-layout-overrides-store-v1.js";
import {
  listMonitoringMapAssetsV1,
  registerMonitoringMapAssetV1,
  updateMonitoringMapAssetV1,
} from "../../monitoring/monitoring-map-assets-store-v1.js";
import { uploadMonitoringMapAssetFileV1 } from "../../monitoring/monitoring-map-asset-upload-v1.js";
import { resolveMonitoringMapAssetStorageModeV1 } from "../../monitoring/monitoring-map-asset-storage-adapter-v1.js";

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

tislyMonitoringV1Router.get("/map-assets", (req, res) => {
  const siteId = resolveMonitoringSiteIdV1(req.query.siteId as string | undefined);
  res.json({
    ...listMonitoringMapAssetsV1(siteId),
    storageMode: resolveMonitoringMapAssetStorageModeV1(),
    uploadMaxBytes: {
      mesh3d: 100 * 1024 * 1024,
      image: 10 * 1024 * 1024,
      json: 5 * 1024 * 1024,
    },
  });
});

tislyMonitoringV1Router.post("/map-assets/upload", async (req, res) => {
  try {
    const body = req.body ?? {};
    const siteId = resolveMonitoringSiteIdV1(body.siteId ?? req.query.siteId);
    if (!body.sourceType || !body.floorLevel || !body.fileName || !body.fileBase64) {
      res.status(400).json({
        error: "sourceType, floorLevel, fileName, fileBase64 are required",
      });
      return;
    }
    const result = await uploadMonitoringMapAssetFileV1({
      siteId,
      title: body.title != null ? String(body.title) : undefined,
      sourceType: body.sourceType,
      floorLevel: body.floorLevel,
      mapType: body.mapType,
      status: body.status,
      notes: body.notes != null ? String(body.notes) : undefined,
      setActive: Boolean(body.setActive),
      originalFileName: String(body.fileName),
      fileBase64: String(body.fileBase64),
      mimeType: body.mimeType != null ? String(body.mimeType) : undefined,
    });
    if (!result.ok || !result.asset) {
      res.status(400).json({ error: result.error ?? "upload failed" });
      return;
    }
    const listed = listMonitoringMapAssetsV1(siteId);
    res.status(201).json({
      ok: true,
      asset: result.asset,
      storageMode: result.storageMode,
      loaderHint: result.loaderHint,
      ...listed,
    });
  } catch {
    res.status(500).json({ error: "upload failed" });
  }
});

tislyMonitoringV1Router.post("/map-assets", (req, res) => {
  const siteId = resolveMonitoringSiteIdV1(req.body?.siteId ?? req.query.siteId);
  const body = req.body ?? {};
  if (!body.title || !body.sourceType || !body.floorLevel) {
    res.status(400).json({ error: "title, sourceType, floorLevel are required" });
    return;
  }
  const record = registerMonitoringMapAssetV1({
    siteId,
    title: String(body.title),
    sourceType: body.sourceType,
    fileType: body.fileType,
    fileName: body.fileName,
    fileSize: body.fileSize,
    floorLevel: body.floorLevel,
    mapType: body.mapType,
    previewUrl: body.previewUrl,
    fileUrl: body.fileUrl,
    transform: body.transform,
    status: body.status,
    notes: body.notes,
    setActive: Boolean(body.setActive),
  });
  res.status(201).json({ ok: true, asset: record, ...listMonitoringMapAssetsV1(siteId) });
});

tislyMonitoringV1Router.patch("/map-assets/:assetId", (req, res) => {
  const siteId = resolveMonitoringSiteIdV1(req.body?.siteId ?? req.query.siteId);
  const assetId = req.params.assetId ?? "";
  const body = req.body ?? {};
  const updated = updateMonitoringMapAssetV1({
    siteId,
    assetId,
    title: body.title,
    transform: body.transform,
    status: body.status,
    notes: body.notes,
    setActive: body.setActive,
    resetTransform: body.resetTransform,
  });
  if (!updated) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  res.json({ ok: true, asset: updated, ...listMonitoringMapAssetsV1(siteId) });
});

tislyMonitoringV1Router.get("/device-layout-overrides", (req, res) => {
  const siteId = resolveMonitoringSiteIdV1(req.query.siteId as string | undefined);
  res.json(listMonitoringDeviceLayoutOverridesV1(siteId));
});

tislyMonitoringV1Router.post("/device-layout-overrides", (req, res) => {
  const siteId = resolveMonitoringSiteIdV1(req.body?.siteId ?? req.query.siteId);
  const body = req.body ?? {};
  if (!body.deviceId || !body.deviceType || !body.position) {
    res.status(400).json({ error: "deviceId, deviceType, position are required" });
    return;
  }
  const record = saveMonitoringDeviceLayoutOverrideV1({
    siteId,
    deviceId: String(body.deviceId),
    deviceType: body.deviceType,
    label: body.label,
    floorLevel: body.floorLevel,
    position: body.position,
    rotation: body.rotation,
    notes: body.notes,
  });
  res.status(201).json({ ok: true, override: record, ...listMonitoringDeviceLayoutOverridesV1(siteId) });
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

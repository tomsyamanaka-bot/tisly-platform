import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-monitoring-3d-v3";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-tisly-monitoring-3d-v3.db";
process.env.TISLY_MONITORING_MAP_ASSETS_PATH = "./data/test-monitoring-map-assets-v3.json";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const {
  buildMonitoring3dSceneV1,
  findMonitoring3dSensorV1,
  findMonitoring3dCameraV1,
} = await import("../src/monitoring/tisly-monitoring-3d-v3.js");
const {
  getMonitoringMapAssetBundleV1,
} = await import("../src/monitoring/tisly-monitoring-map-asset-v1.js");
const {
  resetMonitoringMapAssetsStoreForTestV1,
} = await import("../src/monitoring/monitoring-map-assets-store-v1.js");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");
const FORBIDDEN = /192\.168\.|project-storage|QNAP|SMB|WebDAV|mock fallback|debug/i;

describe("TiSLY Monitoring 3D V3 — mapAsset", () => {
  it("mapAsset has type, floorLevel, position, rotation, scale", () => {
    resetMonitoringMapAssetsStoreForTestV1();
    const bundle = getMonitoringMapAssetBundleV1("DEMO-HOME-001");
    assert.ok(bundle.assets.length >= 4);
    const asset = bundle.assets[0];
    assert.ok(asset.type);
    assert.ok(asset.floorLevel);
    assert.ok(asset.position);
    assert.ok(asset.rotation);
    assert.ok(asset.scale);
    assert.match(bundle.integrationStatusLabel, /mapAsset|LiDAR/);
  });

  it("includes pointcloud placeholder for RoomPlan", () => {
    resetMonitoringMapAssetsStoreForTestV1();
    const bundle = getMonitoringMapAssetBundleV1("DEMO-HOME-001");
    const lidar = bundle.assets.find((a) => a.source === "roomplan" || a.sourceType === "roomplan");
    assert.ok(lidar);
  });
});

describe("TiSLY Monitoring 3D V3 — scene payload", () => {
  it("has six sensors with required ids", () => {
    const scene = buildMonitoring3dSceneV1("DEMO-HOME-001");
    const ids = scene.sensors.map((s) => s.sensorId);
    assert.deepEqual(ids.sort(), ["balcony", "frontDoor", "frontGate", "garage", "living", "stairs"].sort());
  });

  it("sensors have status normal/warning/alert and relatedKnowledgeIds", () => {
    const scene = buildMonitoring3dSceneV1("DEMO-HOME-001");
    scene.sensors.forEach((s) => {
      assert.ok(["normal", "warning", "alert"].includes(s.status));
      assert.ok(Array.isArray(s.relatedKnowledgeIds));
    });
  });

  it("layers include perimeter, 1f, 2f", () => {
    const scene = buildMonitoring3dSceneV1("DEMO-HOME-001");
    const levels = scene.layers.map((l) => l.floorLevel);
    assert.ok(levels.includes("perimeter"));
    assert.ok(levels.includes("1f"));
    assert.ok(levels.includes("2f"));
  });

  it("demo scenarios cover intrusion, fire, equipment", () => {
    const scene = buildMonitoring3dSceneV1("DEMO-HOME-001");
    const ids = scene.demoScenarios.map((d) => d.scenarioId);
    assert.ok(ids.includes("intrusion"));
    assert.ok(ids.includes("fire"));
    assert.ok(ids.includes("equipment"));
  });

  it("cameras resolve by cameraId", () => {
    const cam = findMonitoring3dCameraV1("cam-gate-01");
    assert.ok(cam);
    assert.match(cam!.label, /門扉/);
  });

  it("finds frontDoor sensor", () => {
    const s = findMonitoring3dSensorV1("frontDoor");
    assert.ok(s);
    assert.equal(s?.floorLevel, "1f");
    assert.ok(s?.cameraId);
  });
});

describe("TiSLY Monitoring 3D V3 — API", () => {
  it("GET /api/monitoring/v1/3d-scene", async () => {
    const res = await request(app).get("/api/monitoring/v1/3d-scene?siteId=DEMO-HOME-001");
    assert.equal(res.status, 200);
    assert.equal(res.body.uiVersion, "v3.1");
    assert.ok(res.body.mapAsset);
    assert.ok(res.body.customerLinks.projectPageUrl.includes("knowledge-customer-project"));
    assert.doesNotMatch(JSON.stringify(res.body), FORBIDDEN);
  });

  it("GET /api/monitoring/v1/3d-sensor/:id", async () => {
    const res = await request(app).get("/api/monitoring/v1/3d-sensor/frontDoor?siteId=DEMO-HOME-001");
    assert.equal(res.status, 200);
    assert.equal(res.body.sensor.sensorId, "frontDoor");
    assert.ok(Array.isArray(res.body.relatedKnowledgeIds));
  });

  it("GET /api/monitoring/v1/3d-sensor unknown returns 404", async () => {
    const res = await request(app).get("/api/monitoring/v1/3d-sensor/unknown?siteId=DEMO-HOME-001");
    assert.equal(res.status, 404);
  });
});

describe("TiSLY Monitoring 3D V3 — static pages", () => {
  it("monitoring-3d-v2 page is served", async () => {
    const res = await request(app).get("/monitoring-3d-v2");
    assert.equal(res.status, 200);
    assert.match(res.text, /Future Monitoring Center/);
    assert.match(res.text, /monitoring-3d-v2\.js/);
    assert.match(res.text, /three\.module\.js/);
  });

  it("tisly-monitoring-3d-v3 redirects to monitoring-3d-v2", async () => {
    const res = await request(app).get("/tisly-monitoring-3d-v3");
    assert.equal(res.status, 302);
    assert.match(res.headers.location ?? "", /monitoring-3d-v2/);
  });

  it("CSS includes TV overlay and ripple", () => {
    const css = fs.readFileSync(path.join(publicDir, "monitoring-3d-v2/css/monitoring-3d-v2.css"), "utf8");
    assert.match(css, /mon3dv3-tv-overlay/);
    assert.match(css, /mon3dv3-ripple/);
    assert.match(css, /--mon-cyan/);
  });

  it("JS includes OrbitControls and demo scenarios", () => {
    const js = fs.readFileSync(path.join(publicDir, "monitoring-3d-v2/js/monitoring-3d-v2.js"), "utf8");
    assert.match(js, /OrbitControls/);
    assert.match(js, /triggerDemoScenario/);
    assert.match(js, /flyToSensor/);
    assert.match(js, /relatedKnowledgeIds/);
    assert.match(js, /TV_ALERT_MS/);
    assert.doesNotMatch(js, FORBIDDEN);
  });
});

after(() => {
  resetMonitoringMapAssetsStoreForTestV1();
  closeDatabase();
});

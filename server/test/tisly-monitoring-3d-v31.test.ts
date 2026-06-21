import { describe, it, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-monitoring-3d-v31";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-tisly-monitoring-3d-v31.db";
process.env.TISLY_MONITORING_MAP_ASSETS_PATH = "./data/test-monitoring-map-assets-v31.json";
process.env.TISLY_MONITORING_DEVICE_LAYOUT_PATH = "./data/test-monitoring-device-layout-v31.json";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { buildMonitoring3dSceneV1 } = await import("../src/monitoring/tisly-monitoring-3d-v3.js");
const {
  listMonitoringMapAssetsV1,
  registerMonitoringMapAssetV1,
  updateMonitoringMapAssetV1,
  resetMonitoringMapAssetsStoreForTestV1,
} = await import("../src/monitoring/monitoring-map-assets-store-v1.js");
const {
  listMonitoringDeviceLayoutOverridesV1,
  saveMonitoringDeviceLayoutOverrideV1,
  resetMonitoringDeviceLayoutOverridesForTestV1,
} = await import("../src/monitoring/monitoring-device-layout-overrides-store-v1.js");
const { getMonitoringMapAssetBundleV1 } = await import("../src/monitoring/tisly-monitoring-map-asset-v1.js");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");
const SITE = "DEMO-HOME-001";

describe("Monitoring 3D V3.1 — mapAsset store", () => {
  it("seeds demo assets and returns activeAsset + fallback", () => {
    resetMonitoringMapAssetsStoreForTestV1();
    const listed = listMonitoringMapAssetsV1(SITE);
    assert.ok(listed.assets.length >= 3);
    assert.ok(listed.activeAsset);
    assert.ok(listed.fallbackAsset);
    assert.ok(listed.uploadGuide.polycam.includes("GLB"));
  });

  it("registers new mapAsset metadata", () => {
    resetMonitoringMapAssetsStoreForTestV1();
    const record = registerMonitoringMapAssetV1({
      siteId: SITE,
      title: "Test Polycam",
      sourceType: "polycam",
      fileType: "glb",
      floorLevel: "1f",
      mapType: "mesh",
    });
    assert.ok(record.assetId.startsWith("MA-"));
    assert.equal(record.fileUrl, "");
    assert.equal(record.previewUrl, "/icons/icon-128.png");
  });

  it("updates transform and active switch", () => {
    resetMonitoringMapAssetsStoreForTestV1();
    const a = registerMonitoringMapAssetV1({
      siteId: SITE,
      title: "A",
      sourceType: "mock",
      floorLevel: "1f",
    });
    const b = registerMonitoringMapAssetV1({
      siteId: SITE,
      title: "B",
      sourceType: "mock",
      floorLevel: "2f",
      setActive: true,
    });
    updateMonitoringMapAssetV1({
      siteId: SITE,
      assetId: a.assetId,
      transform: { position: { x: 1, y: 2, z: 3 }, heightOffset: 0.5 },
    });
    const listed = listMonitoringMapAssetsV1(SITE);
    assert.equal(listed.activeAsset?.assetId, b.assetId);
    const updated = listed.assets.find((x) => x.assetId === a.assetId);
    assert.equal(updated?.transform.position.x, 1);
    assert.equal(updated?.transform.heightOffset, 0.5);
  });
});

describe("Monitoring 3D V3.1 — device layout overrides", () => {
  it("saves and lists override", () => {
    resetMonitoringDeviceLayoutOverridesForTestV1();
    saveMonitoringDeviceLayoutOverrideV1({
      siteId: SITE,
      deviceId: "frontDoor",
      deviceType: "door",
      label: "玄関",
      floorLevel: "1f",
      position: { x: 1, y: 2, z: 3 },
    });
    const listed = listMonitoringDeviceLayoutOverridesV1(SITE);
    assert.equal(listed.overrides.length, 1);
    assert.equal(listed.overrides[0].position.x, 1);
    assert.ok(listed.supportedDeviceTypes.includes("camera"));
    assert.ok(listed.supportedDeviceTypes.includes("gate"));
  });
});

describe("Monitoring 3D V3.1 — scene + bundle", () => {
  it("bundle includes registered scan placeholders", () => {
    resetMonitoringMapAssetsStoreForTestV1();
    listMonitoringMapAssetsV1(SITE);
    const bundle = getMonitoringMapAssetBundleV1(SITE);
    const registered = bundle.assets.filter((a) => a.isRegistered);
    assert.ok(registered.length >= 3);
    assert.ok(bundle.activeAsset);
  });

  it("scene payload is v3.1 with overrides applied", () => {
    resetMonitoringDeviceLayoutOverridesForTestV1();
    saveMonitoringDeviceLayoutOverrideV1({
      siteId: SITE,
      deviceId: "living",
      deviceType: "sensor",
      position: { x: 9, y: 9, z: 9 },
    });
    const scene = buildMonitoring3dSceneV1(SITE);
    assert.equal(scene.uiVersion, "v3.3");
    const living = scene.sensors.find((s) => s.sensorId === "living");
    assert.equal(living?.position.x, 9);
    assert.ok(scene.customerLinks.projectPageUrl.includes("knowledge-customer-project"));
  });
});

describe("Monitoring 3D V3.1 — API", () => {
  it("GET /api/monitoring/v1/map-assets", async () => {
    resetMonitoringMapAssetsStoreForTestV1();
    const res = await request(app).get(`/api/monitoring/v1/map-assets?siteId=${SITE}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.siteId, SITE);
    assert.ok(Array.isArray(res.body.assets));
    assert.ok(res.body.fallbackAsset);
    assert.ok(res.body.uploadGuide);
  });

  it("POST /api/monitoring/v1/map-assets", async () => {
    resetMonitoringMapAssetsStoreForTestV1();
    const res = await request(app)
      .post("/api/monitoring/v1/map-assets")
      .send({
        siteId: SITE,
        title: "API Upload",
        sourceType: "scaniverse",
        fileType: "obj",
        floorLevel: "perimeter",
        mapType: "mesh",
      });
    assert.equal(res.status, 201);
    assert.ok(res.body.asset);
    assert.ok(res.body.assets.length >= 1);
  });

  it("PATCH activeAsset switch", async () => {
    resetMonitoringMapAssetsStoreForTestV1();
    const listed = listMonitoringMapAssetsV1(SITE);
    const target = listed.assets[1];
    const res = await request(app)
      .patch(`/api/monitoring/v1/map-assets/${target.assetId}?siteId=${SITE}`)
      .send({ setActive: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.activeAsset.assetId, target.assetId);
  });

  it("GET/POST device-layout-overrides", async () => {
    resetMonitoringDeviceLayoutOverridesForTestV1();
    const post = await request(app)
      .post("/api/monitoring/v1/device-layout-overrides")
      .send({
        siteId: SITE,
        deviceId: "garage",
        deviceType: "sensor",
        position: { x: -5, y: 1, z: 2 },
      });
    assert.equal(post.status, 201);
    const get = await request(app).get(`/api/monitoring/v1/device-layout-overrides?siteId=${SITE}`);
    assert.equal(get.status, 200);
    assert.equal(get.body.overrides.length, 1);
  });

  it("GET /api/monitoring/v1/3d-scene includes mapAsset activeAsset", async () => {
    const res = await request(app).get(`/api/monitoring/v1/3d-scene?siteId=${SITE}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.uiVersion, "v3.3");
    assert.ok(res.body.mapAsset.registeredAssets || res.body.mapAsset.activeAsset !== undefined);
    assert.ok(Array.isArray(res.body.sensors[0].relatedKnowledgeIds));
  });
});

describe("Monitoring 3D V3.1 — static pages", () => {
  it("mapAsset manager page is served", async () => {
    const res = await request(app).get("/monitoring-map-assets-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /mapAsset Manager/);
    assert.match(res.text, /monitoring-map-assets-v1\.js/);
  });

  it("3D JS includes registered placeholder builder", () => {
    const js = fs.readFileSync(path.join(publicDir, "monitoring-3d-v2/js/monitoring-3d-v2.js"), "utf8");
    assert.match(js, /buildRegisteredMapAssetPlaceholder/);
    assert.match(js, /device-layout-overrides/);
    assert.match(js, /relatedKnowledgeIds/);
  });
});

after(() => {
  resetMonitoringMapAssetsStoreForTestV1();
  resetMonitoringDeviceLayoutOverridesForTestV1();
  closeDatabase();
});

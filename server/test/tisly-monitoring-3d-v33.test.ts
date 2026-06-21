import { describe, it, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-monitoring-3d-v33";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-tisly-monitoring-3d-v33.db";
process.env.TISLY_MONITORING_MAP_ASSETS_PATH = "./data/test-monitoring-map-assets-v33.json";
process.env.TISLY_MONITORING_MAP_ASSET_UPLOAD_ROOT = "./data/test-uploads-monitoring-v33";
process.env.TISLY_MONITORING_DEVICE_LAYOUT_PATH = "./data/test-monitoring-device-layout-v33.json";
process.env.TISLY_MONITORING_MAP_ASSET_STORAGE = "local";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const {
  listMonitoringMapAssetsV1,
  resetMonitoringMapAssetsStoreForTestV1,
  registerMonitoringMapAssetV1,
} = await import("../src/monitoring/monitoring-map-assets-store-v1.js");
const {
  resetMonitoringMapAssetUploadDirForTestV1,
  getBackupStatus,
} = await import("../src/monitoring/monitoring-map-asset-storage-adapter-v1.js");
const {
  uploadMonitoringMapAssetFileV1,
  isObjLoadableFileTypeV1,
  isPlyLoadableFileTypeV1,
  isUnsupported3dPreviewFileTypeV1,
  resolveMapAssetLoaderHintV1,
} = await import("../src/monitoring/monitoring-map-asset-upload-v1.js");
const { getMonitoringMapAssetBundleV1 } = await import("../src/monitoring/tisly-monitoring-map-asset-v1.js");
const { buildMonitoring3dSceneV1 } = await import("../src/monitoring/tisly-monitoring-3d-v3.js");
const { resetMonitoringDeviceLayoutOverridesForTestV1 } = await import(
  "../src/monitoring/monitoring-device-layout-overrides-store-v1.js"
);

const app = createApp();
const publicDir = path.join(process.cwd(), "public");
const SITE = "DEMO-HOME-001";
const FACTORY = "DEMO-FACTORY-001";

function resetAll() {
  resetMonitoringMapAssetsStoreForTestV1();
  resetMonitoringMapAssetUploadDirForTestV1();
  resetMonitoringDeviceLayoutOverridesForTestV1();
}

describe("Monitoring 3D V3.3 — loader hints", () => {
  it("OBJ and PLY are loader targets", () => {
    assert.equal(isObjLoadableFileTypeV1("obj"), true);
    assert.equal(isPlyLoadableFileTypeV1("ply"), true);
    assert.equal(resolveMapAssetLoaderHintV1("obj"), "obj");
    assert.equal(resolveMapAssetLoaderHintV1("ply"), "ply");
  });

  it("USDZ is fallback only", () => {
    assert.equal(isUnsupported3dPreviewFileTypeV1("usdz"), true);
    assert.equal(isUnsupported3dPreviewFileTypeV1("obj"), false);
    assert.equal(resolveMapAssetLoaderHintV1("usdz"), "placeholder");
  });
});

describe("Monitoring 3D V3.3 — multi floor bundle", () => {
  it("returns assetsByFloor and display modes", () => {
    resetAll();
    listMonitoringMapAssetsV1(SITE);
    const bundle = getMonitoringMapAssetBundleV1(SITE);
    assert.ok(bundle.displayModes.length >= 5);
    assert.equal(bundle.defaultDisplayMode, "all_floors");
    assert.ok(bundle.assetsByFloor["1f"]?.length >= 1);
    assert.ok(bundle.floorHeightOffsets["2f"] > 0);
  });

  it("OBJ with fileUrl is not placeholder in bundle", async () => {
    resetAll();
    await uploadMonitoringMapAssetFileV1({
      siteId: SITE,
      title: "OBJ Scan",
      sourceType: "scaniverse",
      floorLevel: "perimeter",
      originalFileName: "yard.obj",
      fileBase64: Buffer.from("o test\n").toString("base64"),
      setActive: true,
    });
    const bundle = getMonitoringMapAssetBundleV1(SITE);
    const entry = bundle.assets.find((a) => a.isRegistered && a.fileType === "obj");
    assert.ok(entry);
    assert.equal(entry?.isPlaceholder, false);
  });
});

describe("Monitoring 3D V3.3 — API", () => {
  it("GET /map-assets includes backupStatus", async () => {
    resetAll();
    const res = await request(app).get(`/api/monitoring/v1/map-assets?siteId=${SITE}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.backupStatus);
    assert.equal(typeof res.body.backupStatus.localOk, "boolean");
  });

  it("GET /3d-scene uiVersion v3.4", async () => {
    resetAll();
    const res = await request(app).get(`/api/monitoring/v1/3d-scene?siteId=${SITE}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.uiVersion, "v3.4");
    assert.ok(res.body.mapAsset.displayModes);
    assert.equal(res.body.mapAssetDisplayMode, "all_floors");
  });

  it("DELETE /map-assets/:assetId", async () => {
    resetAll();
    const record = registerMonitoringMapAssetV1({
      siteId: SITE,
      title: "To Delete",
      sourceType: "mock",
      floorLevel: "1f",
    });
    const res = await request(app).delete(
      `/api/monitoring/v1/map-assets/${encodeURIComponent(record.assetId)}?siteId=${SITE}`
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.deleted);
    assert.ok(!res.body.assets.some((a: { assetId: string }) => a.assetId === record.assetId));
  });

  it("POST device-layout-overrides persists", async () => {
    resetAll();
    const res = await request(app)
      .post("/api/monitoring/v1/device-layout-overrides")
      .send({
        siteId: SITE,
        deviceId: "frontGate",
        deviceType: "gate",
        position: { x: 1.5, y: 0.9, z: -8 },
      });
    assert.equal(res.status, 201);
    const scene = buildMonitoring3dSceneV1(SITE);
    const sensor = scene.sensors.find((s) => s.sensorId === "frontGate");
    assert.equal(sensor?.position.x, 1.5);
  });

  it("DEMO-FACTORY-001 seed scene", async () => {
    resetAll();
    const res = await request(app).get(`/api/monitoring/v1/3d-scene?siteId=${FACTORY}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.siteId, "DEMO-FACTORY-001");
    assert.ok(res.body.sensors.some((s: { sensorId: string }) => s.sensorId === "silo01"));
    assert.ok(res.body.sensors.some((s: { sensorId: string }) => s.sensorId === "conveyor01"));
    const listed = listMonitoringMapAssetsV1(FACTORY);
    assert.ok(listed.assets.length >= 3);
  });
});

describe("Monitoring 3D V3.3 — static pages", () => {
  it("3D JS includes OBJLoader and PLYLoader", () => {
    const js = fs.readFileSync(path.join(publicDir, "monitoring-3d-v2/js/monitoring-3d-v2.js"), "utf8");
    assert.match(js, /OBJLoader/);
    assert.match(js, /PLYLoader/);
    assert.match(js, /loadMapAssets/);
    assert.match(js, /all_floors/);
  });

  it("Manager page mentions V3.3", async () => {
    const res = await request(app).get("/monitoring-map-assets-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /V3\.3/);
  });

  it("Manager JS includes delete and floor tabs", () => {
    const js = fs.readFileSync(
      path.join(publicDir, "monitoring-map-assets-v1/js/monitoring-map-assets-v1.js"),
      "utf8"
    );
    assert.match(js, /mma-delete/);
    assert.match(js, /reset-transforms/);
    assert.match(js, /OBJLoader/);
  });

  it("backupStatus helper returns mode", () => {
    const status = getBackupStatus();
    assert.equal(status.mode, "local");
    assert.ok(status.message);
  });
});

describe("Monitoring 3D V3.3 — regression", () => {
  it("V3.2 upload still works", async () => {
    resetAll();
    const res = await request(app)
      .post("/api/monitoring/v1/map-assets/upload")
      .send({
        siteId: SITE,
        sourceType: "polycam",
        floorLevel: "1f",
        fileName: "tiny.glb",
        fileBase64: Buffer.alloc(24).toString("base64"),
        setActive: true,
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.loaderHint, "gltf");
  });
});

after(() => {
  resetAll();
  closeDatabase();
});

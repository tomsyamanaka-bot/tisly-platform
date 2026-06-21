import { describe, it, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-monitoring-3d-v32";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-tisly-monitoring-3d-v32.db";
process.env.TISLY_MONITORING_MAP_ASSETS_PATH = "./data/test-monitoring-map-assets-v32.json";
process.env.TISLY_MONITORING_MAP_ASSET_UPLOAD_ROOT = "./data/test-uploads-monitoring-v32";
process.env.TISLY_MONITORING_DEVICE_LAYOUT_PATH = "./data/test-monitoring-device-layout-v32.json";
process.env.TISLY_MONITORING_MAP_ASSET_STORAGE = "local";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const {
  listMonitoringMapAssetsV1,
  resetMonitoringMapAssetsStoreForTestV1,
} = await import("../src/monitoring/monitoring-map-assets-store-v1.js");
const {
  resetMonitoringMapAssetUploadDirForTestV1,
  getMonitoringMapAssetUploadRootV1,
} = await import("../src/monitoring/monitoring-map-asset-storage-adapter-v1.js");
const {
  uploadMonitoringMapAssetFileV1,
  sanitizeMonitoringSiteIdV1,
  buildSafeMapAssetFileNameV1,
  detectMapAssetFileTypeV1,
  isGltfLoadableFileTypeV1,
  isUnsupported3dPreviewFileTypeV1,
} = await import("../src/monitoring/monitoring-map-asset-upload-v1.js");
const { getMonitoringMapAssetBundleV1 } = await import("../src/monitoring/tisly-monitoring-map-asset-v1.js");
const { buildMonitoring3dSceneV1 } = await import("../src/monitoring/tisly-monitoring-3d-v3.js");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");
const SITE = "DEMO-HOME-001";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function resetAll() {
  resetMonitoringMapAssetsStoreForTestV1();
  resetMonitoringMapAssetUploadDirForTestV1();
}

describe("Monitoring 3D V3.2 — upload validation", () => {
  it("sanitizeMonitoringSiteIdV1 rejects traversal", () => {
    assert.equal(sanitizeMonitoringSiteIdV1("DEMO-HOME-001"), "DEMO-HOME-001");
    assert.equal(sanitizeMonitoringSiteIdV1("../evil"), null);
    assert.equal(sanitizeMonitoringSiteIdV1("site/id"), null);
  });

  it("buildSafeMapAssetFileNameV1 keeps allowed extension", () => {
    const name = buildSafeMapAssetFileNameV1("MA-DEMO-001-ABCD", "scan.glb");
    assert.match(name, /^MA-DEMO-001-ABCD-[a-f0-9]+\.glb$/);
  });

  it("detectMapAssetFileTypeV1 and loader hints", () => {
    assert.equal(detectMapAssetFileTypeV1("a.glb"), "glb");
    assert.equal(isGltfLoadableFileTypeV1("gltf"), true);
    assert.equal(isGltfLoadableFileTypeV1("obj"), false);
    assert.equal(isUnsupported3dPreviewFileTypeV1("usdz"), true);
  });
});

describe("Monitoring 3D V3.2 — file upload store", () => {
  it("uploads allowed png and saves fileUrl", async () => {
    resetAll();
    const result = await uploadMonitoringMapAssetFileV1({
      siteId: SITE,
      title: "Test PNG",
      sourceType: "manual",
      floorLevel: "1f",
      originalFileName: "preview.png",
      fileBase64: TINY_PNG_BASE64,
      mimeType: "image/png",
      setActive: true,
    });
    assert.equal(result.ok, true);
    assert.ok(result.asset?.fileUrl.startsWith("/uploads/monitoring/"));
    assert.ok(result.asset?.safeFileName?.endsWith(".png"));
    assert.equal(result.loaderHint, "image");

    const diskPath = path.join(
      getMonitoringMapAssetUploadRootV1(),
      SITE,
      result.asset!.safeFileName!
    );
    assert.ok(fs.existsSync(diskPath));
  });

  it("rejects forbidden extension", async () => {
    resetAll();
    const result = await uploadMonitoringMapAssetFileV1({
      siteId: SITE,
      title: "Bad",
      sourceType: "mock",
      floorLevel: "1f",
      originalFileName: "virus.exe",
      fileBase64: TINY_PNG_BASE64,
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /extension/i);
  });

  it("GLB upload marks loaderHint gltf", async () => {
    resetAll();
    const glbHeader = Buffer.alloc(12);
    glbHeader.writeUInt32LE(0x46546c67, 0);
    glbHeader.writeUInt32LE(12, 4);
    glbHeader.writeUInt32LE(0, 8);
    const result = await uploadMonitoringMapAssetFileV1({
      siteId: SITE,
      title: "Tiny GLB",
      sourceType: "polycam",
      floorLevel: "1f",
      originalFileName: "tiny.glb",
      fileBase64: glbHeader.toString("base64"),
      mimeType: "model/gltf-binary",
      setActive: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.loaderHint, "gltf");
  });
});

describe("Monitoring 3D V3.2 — API", () => {
  it("POST /map-assets/upload success", async () => {
    resetAll();
    const res = await request(app)
      .post("/api/monitoring/v1/map-assets/upload")
      .send({
        siteId: SITE,
        title: "API PNG",
        sourceType: "scaniverse",
        floorLevel: "perimeter",
        mapType: "mesh",
        fileName: "scan.png",
        fileBase64: TINY_PNG_BASE64,
        mimeType: "image/png",
        setActive: true,
      });
    assert.equal(res.status, 201);
    assert.ok(res.body.asset.fileUrl);
    assert.ok(Array.isArray(res.body.assets));
    assert.equal(res.body.activeAsset.assetId, res.body.asset.assetId);
    const bodyStr = JSON.stringify(res.body);
    assert.doesNotMatch(bodyStr, /uploads\\\\/);
    assert.doesNotMatch(bodyStr, /process\.cwd/);
  });

  it("POST /map-assets/upload rejects bad extension", async () => {
    resetAll();
    const res = await request(app)
      .post("/api/monitoring/v1/map-assets/upload")
      .send({
        siteId: SITE,
        sourceType: "mock",
        floorLevel: "1f",
        fileName: "bad.zip",
        fileBase64: TINY_PNG_BASE64,
      });
    assert.equal(res.status, 400);
  });

  it("GET /map-assets lists uploaded asset with fileUrl", async () => {
    resetAll();
    await uploadMonitoringMapAssetFileV1({
      siteId: SITE,
      title: "Listed",
      sourceType: "polycam",
      floorLevel: "2f",
      originalFileName: "floor.glb",
      fileBase64: Buffer.alloc(20).toString("base64"),
    });
    const res = await request(app).get(`/api/monitoring/v1/map-assets?siteId=${SITE}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.assets.some((a: { fileUrl: string }) => a.fileUrl));
    assert.ok(res.body.storageMode);
    assert.ok(res.body.uploadMaxBytes);
  });

  it("static file served under /uploads/monitoring", async () => {
    resetAll();
    const up = await uploadMonitoringMapAssetFileV1({
      siteId: SITE,
      title: "Static",
      sourceType: "manual",
      floorLevel: "1f",
      originalFileName: "static.png",
      fileBase64: TINY_PNG_BASE64,
    });
    const res = await request(app).get(up.asset!.fileUrl!);
    assert.equal(res.status, 200);
  });

  it("GET /3d-scene uiVersion v3.2 with gltf-loadable active asset", async () => {
    resetAll();
    await uploadMonitoringMapAssetFileV1({
      siteId: SITE,
      title: "GLB Active",
      sourceType: "polycam",
      floorLevel: "1f",
      originalFileName: "room.glb",
      fileBase64: Buffer.alloc(24).toString("base64"),
      setActive: true,
    });
    const scene = buildMonitoring3dSceneV1(SITE);
    assert.equal(scene.uiVersion, "v3.2");
    assert.ok(scene.mapAsset.activeAsset?.fileUrl);
    const entry = scene.mapAsset.assets.find((a) => a.isRegistered && a.assetId === scene.mapAsset.activeAsset?.assetId);
    assert.equal(entry?.fileType, "glb");
    assert.equal(entry?.isPlaceholder, false);
  });

  it("OBJ active asset remains placeholder in bundle", async () => {
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
    const entry = bundle.assets.find((a) => a.isRegistered && a.assetId === bundle.activeAsset?.assetId);
    assert.equal(entry?.fileType, "obj");
    assert.equal(entry?.isPlaceholder, true);
  });
});

describe("Monitoring 3D V3.2 — static pages", () => {
  it("mapAsset manager page mentions V3.2 upload", async () => {
    const res = await request(app).get("/monitoring-map-assets-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /V3\.2/);
    assert.match(res.text, /map-assets-v1\.js/);
  });

  it("3D JS includes GLTFLoader", () => {
    const js = fs.readFileSync(path.join(publicDir, "monitoring-3d-v2/js/monitoring-3d-v2.js"), "utf8");
    assert.match(js, /GLTFLoader/);
    assert.match(js, /loadActiveGltfAsset/);
  });

  it("Manager JS includes file upload", () => {
    const js = fs.readFileSync(path.join(publicDir, "monitoring-map-assets-v1/js/monitoring-map-assets-v1.js"), "utf8");
    assert.match(js, /map-assets\/upload/);
    assert.match(js, /showAssetPreview/);
  });
});

after(() => {
  resetAll();
  closeDatabase();
});

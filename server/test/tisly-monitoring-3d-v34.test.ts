import { describe, it, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-monitoring-3d-v34";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-tisly-monitoring-3d-v34.db";
process.env.TISLY_MONITORING_MAP_ASSETS_PATH = "./data/test-monitoring-map-assets-v34.json";
process.env.TISLY_MONITORING_MAP_ASSET_UPLOAD_ROOT = "./data/test-uploads-monitoring-v34";
process.env.TISLY_MONITORING_DEVICE_LAYOUT_PATH = "./data/test-monitoring-device-layout-v34.json";
process.env.TISLY_MONITORING_DEVICE_ATTACHMENTS_PATH = "./data/test-monitoring-device-attachments-v34.json";
process.env.TISLY_MONITORING_REPORT_PHOTO_SLOTS_PATH = "./data/test-monitoring-report-photo-slots-v34.json";
process.env.TISLY_MONITORING_MAP_ASSET_STORAGE = "local";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { resetMonitoringMapAssetsStoreForTestV1 } = await import(
  "../src/monitoring/monitoring-map-assets-store-v1.js"
);
const { resetMonitoringMapAssetUploadDirForTestV1 } = await import(
  "../src/monitoring/monitoring-map-asset-storage-adapter-v1.js"
);
const { resetMonitoringDeviceLayoutOverridesForTestV1 } = await import(
  "../src/monitoring/monitoring-device-layout-overrides-store-v1.js"
);
const {
  resetMonitoringDeviceAttachmentsForTestV1,
  listMonitoringDeviceAttachmentsV1,
} = await import("../src/monitoring/monitoring-device-attachments-v1.js");
const { resetMonitoringReportPhotoSlotsForTestV1 } = await import(
  "../src/monitoring/monitoring-report-photo-slots-v1.js"
);
const { buildMonitoring3dSceneV1 } = await import("../src/monitoring/tisly-monitoring-3d-v3.js");
const { buildMonitoringCustomerLinksV1 } = await import("../src/monitoring/tisly-monitoring-dashboard-v1.js");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");
const SITE = "DEMO-HOME-001";
const FACTORY = "DEMO-FACTORY-001";

function resetAll() {
  resetMonitoringMapAssetsStoreForTestV1();
  resetMonitoringMapAssetUploadDirForTestV1();
  resetMonitoringDeviceLayoutOverridesForTestV1();
  resetMonitoringDeviceAttachmentsForTestV1();
  resetMonitoringReportPhotoSlotsForTestV1();
}

describe("Monitoring 3D V3.4 — device attachments API", () => {
  it("lists attachments for frontDoor", async () => {
    resetAll();
    const res = await request(app).get(
      `/api/monitoring/v1/device-attachments?siteId=${SITE}&deviceId=frontDoor`
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.siteId, SITE);
    assert.equal(res.body.deviceId, "frontDoor");
    assert.ok(res.body.records.length >= 1);
    const att = res.body.records[0].attachments;
    assert.ok(att.some((a: { type: string }) => a.type === "survey_photo"));
    assert.ok(att.some((a: { type: string }) => a.type === "spec_pdf"));
  });

  it("returns empty array when device has no attachments", async () => {
    resetAll();
    const res = await request(app).get(
      `/api/monitoring/v1/device-attachments?siteId=${SITE}&deviceId=stairs`
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.records.length, 0);
  });

  it("adds attachment via POST", async () => {
    resetAll();
    const res = await request(app)
      .post("/api/monitoring/v1/device-attachments")
      .send({
        siteId: SITE,
        deviceId: "stairs",
        deviceName: "階段",
        type: "device_photo",
        title: "テスト写真",
        openUrl: "/icons/icon-128.png",
        reportVisible: true,
      });
    assert.equal(res.status, 201);
    assert.ok(res.body.attachment?.attachmentId);
    const listed = listMonitoringDeviceAttachmentsV1(SITE, "stairs");
    assert.equal(listed.records[0].attachments.length, 1);
  });

  it("deletes attachment and strips internal source from responses", async () => {
    resetAll();
    const listed = listMonitoringDeviceAttachmentsV1(SITE, "frontDoor");
    const target = listed.records[0].attachments[0];
    const res = await request(app).delete(
      `/api/monitoring/v1/device-attachments/${encodeURIComponent(target.attachmentId)}`
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    const sensorRes = await request(app).get(
      `/api/monitoring/v1/3d-sensor/frontDoor?siteId=${SITE}`
    );
    assert.equal(sensorRes.status, 200);
    const json = JSON.stringify(sensorRes.body);
    assert.doesNotMatch(json, /project-storage/);
    assert.doesNotMatch(json, /\\\\192\.168/);
    assert.doesNotMatch(json, /"source"/);
  });
});

describe("Monitoring 3D V3.4 — report photo slots", () => {
  it("GET returns empty slots initially", async () => {
    resetAll();
    const res = await request(app).get(`/api/monitoring/v1/report-photo-slots?siteId=${SITE}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.maxSlots, 6);
    assert.equal(res.body.slots.length, 0);
  });

  it("adds reportVisible photo to slots", async () => {
    resetAll();
    const listed = listMonitoringDeviceAttachmentsV1(SITE, "frontDoor");
    const photo = listed.records[0].attachments.find(
      (a: { reportVisible: boolean; type: string }) => a.reportVisible && a.type === "after_photo"
    );
    assert.ok(photo);
    const res = await request(app)
      .post("/api/monitoring/v1/report-photo-slots")
      .send({ siteId: SITE, deviceId: "frontDoor", attachmentId: photo.attachmentId });
    assert.equal(res.status, 201);
    assert.equal(res.body.slots.length, 1);
  });

  it("rejects non-reportVisible attachment", async () => {
    resetAll();
    const listed = listMonitoringDeviceAttachmentsV1(SITE, "frontDoor");
    const photo = listed.records[0].attachments.find(
      (a: { reportVisible: boolean }) => !a.reportVisible
    );
    assert.ok(photo);
    const res = await request(app)
      .post("/api/monitoring/v1/report-photo-slots")
      .send({ siteId: SITE, deviceId: "frontDoor", attachmentId: photo.attachmentId });
    assert.equal(res.status, 400);
  });

  it("enforces max 6 slots", async () => {
    resetAll();
    const attachmentIds: string[] = [];
    for (let i = 0; i < 7; i++) {
      const add = await request(app)
        .post("/api/monitoring/v1/device-attachments")
        .send({
          siteId: SITE,
          deviceId: "living",
          type: "after_photo",
          title: `slot-photo-${i}`,
          openUrl: "/icons/icon-128.png",
          reportVisible: true,
        });
      assert.equal(add.status, 201);
      attachmentIds.push(add.body.attachment.attachmentId);
    }
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post("/api/monitoring/v1/report-photo-slots")
        .send({ siteId: SITE, deviceId: "living", attachmentId: attachmentIds[i] });
      assert.equal(res.status, 201);
    }
    const overflow = await request(app)
      .post("/api/monitoring/v1/report-photo-slots")
      .send({ siteId: SITE, deviceId: "living", attachmentId: attachmentIds[6] });
    assert.equal(overflow.status, 400);
    assert.match(overflow.body.error, /Maximum 6/);
  });
});

describe("Monitoring 3D V3.4 — Customer links and 3D sensor payload", () => {
  it("builds Customer UI links with ref", () => {
    const links = buildMonitoringCustomerLinksV1(SITE, "frontDoor");
    assert.match(links.projectUrl, /knowledge-customer-project-v1/);
    assert.match(links.siteMapUrl, /knowledge-customer-site-map-v1/);
    assert.ok(links.customerExplanationUrl.includes("knowledge-customer"));
    const factoryLinks = buildMonitoringCustomerLinksV1(FACTORY, "conveyor-01");
    assert.match(factoryLinks.customerExplanationUrl, /knowledge-customer-detail-v1/);
  });

  it("3d-sensor includes attachments and reportPhotoCandidates", async () => {
    resetAll();
    const res = await request(app).get(`/api/monitoring/v1/3d-sensor/frontDoor?siteId=${SITE}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.attachments));
    assert.ok(res.body.attachments.length >= 1);
    assert.ok(Array.isArray(res.body.reportPhotoCandidates));
    assert.ok(res.body.customerLinks?.siteMapUrl);
  });

  it("scene uiVersion is v3.4", async () => {
    resetAll();
    const scene = buildMonitoring3dSceneV1(SITE);
    assert.equal(scene.uiVersion, "v3.4");
    const res = await request(app).get(`/api/monitoring/v1/3d-scene?siteId=${SITE}`);
    assert.equal(res.body.uiVersion, "v3.4");
  });
});

describe("Monitoring 3D V3.4 — DEMO-FACTORY-001 attachments", () => {
  it("factory devices have attachment seed", async () => {
    resetAll();
    for (const deviceId of ["silo01", "mixer01", "conveyor01", "shippingGate"]) {
      const res = await request(app).get(
        `/api/monitoring/v1/device-attachments?siteId=${FACTORY}&deviceId=${deviceId}`
      );
      assert.equal(res.status, 200);
      assert.ok(res.body.records[0]?.attachments?.length >= 1, deviceId);
    }
  });
});

describe("Monitoring 3D V3.4 — UI assets", () => {
  it("3D JS includes materials tab and photo pins", () => {
    const js = fs.readFileSync(path.join(publicDir, "monitoring-3d-v2/js/monitoring-3d-v2.js"), "utf8");
    assert.match(js, /switchRightTab/);
    assert.match(js, /renderAttachmentsPanel/);
    assert.match(js, /buildPhotoPinsFromAttachments/);
    assert.match(js, /report-photo-slots/);
  });

  it("HTML has four right panel tabs", () => {
    const html = fs.readFileSync(path.join(publicDir, "monitoring-3d-v2/index.html"), "utf8");
    assert.match(html, /data-tab="materials"/);
    assert.match(html, /data-tab="logs"/);
  });
});

describe("Monitoring 3D V3.4 — PWA route issues (Phase0)", () => {
  it("/estimate returns 404 — use /estimate-v1", async () => {
    const res = await request(app).get("/estimate");
    assert.equal(res.status, 404);
    const ok = await request(app).get("/estimate-v1");
    assert.equal(ok.status, 200);
  });

  it("/invoice returns 404 — use /estimate-v1", async () => {
    const res = await request(app).get("/invoice");
    assert.equal(res.status, 404);
  });

  it("/drawing-editor returns 404 — use /survey-drawing-v1", async () => {
    const res = await request(app).get("/drawing-editor");
    assert.equal(res.status, 404);
    const ok = await request(app).get("/survey-drawing-v1");
    assert.equal(ok.status, 200);
  });

  it("/route-map lists known routes", async () => {
    const res = await request(app).get("/route-map");
    assert.equal(res.status, 200);
    assert.match(res.text, /estimate-v1/);
    assert.match(res.text, /monitoring-3d-v2/);
  });
});

after(async () => {
  resetAll();
  await closeDatabase();
});

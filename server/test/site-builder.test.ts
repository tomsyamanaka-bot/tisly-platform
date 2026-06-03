import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDb = path.join(__dirname, "..", "data", "test-phase321.db");

describe("Phase 321 site builder", () => {
  before(() => {
    process.env.DB_PATH = testDb;
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
  });

  after(async () => {
    const { closeDatabase } = await import("../src/db/database.js");
    closeDatabase();
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
  });

  it("creates floors, zones, and map device positions", async () => {
    const { getDatabase } = await import("../src/db/database.js");
    getDatabase();
    const { createSite } = await import("../src/site-builder/site-store.js");
    const { createFloor } = await import("../src/site-builder/floor-store.js");
    const { createZone } = await import("../src/site-builder/zone-store.js");
    const { updateDeviceMapPosition, listMapDevicesForCustomer } = await import(
      "../src/site-builder/map-store.js"
    );
    const db = getDatabase();
    db.prepare(
      `INSERT OR IGNORE INTO tenants (id, name) VALUES ('cust-321', 'Test Tenant 321')`
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO customers (customer_id, customer_code, customer_name, plan, status, tenant_id)
       VALUES ('cust-321', 'TEST321', 'Test 321', 'PRO_REMOTE', 'active', 'cust-321')`
    ).run();
    const site = createSite({
      tenantId: "cust-321",
      customerId: "cust-321",
      name: "Test Site",
      address: "Tokyo",
    });
    const floor = createFloor({ siteId: site.id, name: "1F" });
    const zone = createZone({ siteId: site.id, floorId: floor.id, name: "Lobby", type: "room" });
    const { v4: uuid } = await import("uuid");
    const devId = `dev-map-${uuid().slice(0, 8)}`;
    const rowId = uuid();
    db.prepare(
      `INSERT INTO devices (id, customer_id, site_id, zone_id, floor_id, device_type, device_id, label, created_at, updated_at)
       VALUES (?, 'cust-321', ?, ?, ?, 'ESP', ?, 'Sensor A', datetime('now'), datetime('now'))`
    ).run(rowId, site.id, zone.id, floor.id, devId);
    assert.equal(updateDeviceMapPosition(devId, { posX: 0.42, posY: 0.55, iconType: "sensor" }), true);
    const list = listMapDevicesForCustomer("cust-321");
    const found = list.find((d) => d.deviceId === devId);
    assert.ok(found);
    assert.equal(found!.posX, 0.42);
    assert.equal(found!.posY, 0.55);
  });

  it("schedule engine resolves business mode", async () => {
    const { getDatabase } = await import("../src/db/database.js");
    getDatabase();
    const { createSchedule, resolveActiveMode } = await import("../src/schedule/schedule-engine.js");
    createSchedule({
      customerId: "cust-321",
      name: "Biz",
      mode: "business",
      timeStart: "00:00",
      timeEnd: "23:59",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
    const mode = resolveActiveMode("cust-321", new Date("2026-06-03T12:00:00+09:00"));
    assert.equal(mode, "business");
  });
});

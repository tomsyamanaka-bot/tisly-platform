import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-hb-421";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-device-heartbeat-421.db";
process.env.DEVICE_HEARTBEAT_WARN_SEC = "1";
process.env.DEVICE_HEARTBEAT_OFFLINE_SEC = "3";
process.env.DEVICE_HEARTBEAT_POLL_MS = "500";

const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  recordDeviceHeartbeat,
  evaluateDeviceHeartbeatStatuses,
  getHeartbeatThresholds,
} = await import("../src/device/device-heartbeat.js");

describe("Phase 421-440 device heartbeat engine", () => {
  before(() => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
  });

  after(() => closeDatabase());

  it("thresholds default to 5min / 15min when env unset", () => {
    delete process.env.DEVICE_HEARTBEAT_WARN_SEC;
    delete process.env.DEVICE_HEARTBEAT_OFFLINE_SEC;
    const t = getHeartbeatThresholds();
    assert.equal(t.warnSec, 300);
    assert.equal(t.offlineSec, 900);
  });

  it("WARNING after warn threshold, OFFLINE after offline threshold", async () => {
    process.env.DEVICE_HEARTBEAT_WARN_SEC = "1";
    process.env.DEVICE_HEARTBEAT_OFFLINE_SEC = "3";
    const deviceId = "HB-TEST-421";
    recordDeviceHeartbeat(deviceId, "test");
    const db = getDatabase();
    const staleWarn = new Date(Date.now() - 2000).toISOString();
    db.prepare(`UPDATE devices SET last_heartbeat_at = ?, device_status = 'ONLINE' WHERE device_id = ?`).run(
      staleWarn,
      deviceId
    );
    const warnChanges = evaluateDeviceHeartbeatStatuses();
    const warn = warnChanges.find((c) => c.deviceId === deviceId);
    assert.ok(warn);
    assert.equal(warn?.status, "WARNING");

    const staleOff = new Date(Date.now() - 5000).toISOString();
    db.prepare(`UPDATE devices SET last_heartbeat_at = ? WHERE device_id = ?`).run(staleOff, deviceId);
    const offChanges = evaluateDeviceHeartbeatStatuses();
    const off = offChanges.find((c) => c.deviceId === deviceId);
    assert.ok(off);
    assert.equal(off?.status, "OFFLINE");
  });
});

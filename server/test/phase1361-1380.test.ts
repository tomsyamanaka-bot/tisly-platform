import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

import { hashPassword } from "../src/auth/password.js";
import {
  getLockProvider,
  initLockProvider,
  MockLockProvider,
  resetLockProviderForTests,
  resolveLockProviderId,
  setLockProvider,
} from "../src/providers/lock/index.js";
import {
  ensureLockProviderSeed,
  listLockUsers,
  resetLockProviderStoreForTests,
} from "../src/lock-provider/lock-provider-store.js";
import { generateMockLockEvent } from "../src/services/lockEventService.js";
import {
  listChildArrivalNotifications,
  listPresenceUsers,
} from "../src/services/familyPresenceService.js";
import { resetSecurityAutomationForTests } from "../src/security-automation/security-automation-store.js";
import { resetSwitchBotBridgeState } from "../src/services/switchBotSecurityBridge.js";
import { resetSwitchBotMockState } from "../src/services/switchbotService.js";
import { getSecurityState } from "../src/services/securityAutomationService.js";
import { clearPendingArmTimer } from "../src/services/securityAutomationService.js";

process.env.JWT_SECRET = "test-phase1361-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1361-1380.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.LOCK_PROVIDER = "switchbot";
process.env.SWITCHBOT_MODE = "mock";
process.env.SWITCHBOT_LOCK_DEVICE_ID = "mock-lock-001";
process.env.SWITCHBOT_WORKER_ENABLED = "false";
process.env.DEMO_RESET_ENABLED = "false";

const dbPath = process.env.TISLY_DB_PATH;

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

async function adminLogin(): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "testpass" });
  assert.equal(res.status, 200);
  return res.body.token as string;
}

describe("Phase 1361-1380 Lock Provider & Family Presence", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    resetLockProviderForTests();
    initLockProvider();
    resetSecurityAutomationForTests();
    resetLockProviderStoreForTests();
    ensureLockProviderSeed();
    resetSwitchBotMockState("unlocked");
    resetSwitchBotBridgeState();
    clearPendingArmTimer();
  });

  after(() => {
    clearPendingArmTimer();
    closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("LockProvider interface — switchbot provider exposes capabilities", async () => {
    const provider = getLockProvider();
    assert.equal(provider.providerId, "switchbot");
    assert.equal(provider.supportsRemoteUnlock(), true);
    assert.equal(provider.supportsFaceRecognition(), false);
    const status = await provider.getStatus();
    assert.ok(status.deviceId);
    assert.ok(["locked", "unlocked", "unknown", "offline"].includes(status.lockState));
  });

  it("LOCK_PROVIDER=mock resolves mock provider", () => {
    process.env.LOCK_PROVIDER = "mock";
    resetLockProviderForTests();
    initLockProvider();
    const provider = getLockProvider();
    assert.equal(provider.providerId, "mock");
    assert.equal(provider.supportsFaceRecognition(), true);
    process.env.LOCK_PROVIDER = "switchbot";
    resetLockProviderForTests();
    initLockProvider();
  });

  it("seed LockUser and PresenceUser models", () => {
    const users = listLockUsers();
    assert.ok(users.length >= 4);
    assert.ok(users.some((u) => u.name === "長女" && u.role === "child"));
    const presence = listPresenceUsers();
    assert.ok(presence.some((p) => p.role === "child"));
  });

  it("mock child_arrival generates face_unlock event and notification", () => {
    const before = listChildArrivalNotifications(10).length;
    const event = generateMockLockEvent("child_arrival");
    assert.equal(event.eventType, "face_unlock");
    assert.equal(event.userName, "長女");
    assert.equal(event.provider, "sesame");
    const after = listChildArrivalNotifications(10);
    assert.ok(after.length > before);
    assert.ok(after[0].message.includes("長女"));
    assert.equal(getSecurityState().mode, "disarmed");
  });

  it("mock guest_unlock and unknown_unlock scenarios", () => {
    const guest = generateMockLockEvent("guest_unlock");
    assert.equal(guest.eventType, "nfc_unlock");
    const unknown = generateMockLockEvent("unknown_unlock");
    assert.equal(unknown.eventType, "unknown");
    assert.equal(unknown.success, false);
  });

  it("GET /api/security/state includes lock provider dashboard", async () => {
    const token = await adminLogin();
    const res = await request(app)
      .get("/api/security/state")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.lockProvider, "switchbot");
    assert.ok(res.body.lock);
    assert.ok(res.body.lock.capabilities);
  });

  it("POST /api/security/lock/mock/child_arrival via API", async () => {
    const token = await adminLogin();
    const res = await request(app)
      .post("/api/security/lock/mock/child_arrival")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.event.eventType, "face_unlock");
    assert.ok(res.body.family);
  });

  it("GET /operations/security serves HTML", async () => {
    const res = await request(app).get("/operations/security");
    assert.equal(res.status, 200);
    assert.match(res.text, /Lock Event/);
    assert.match(res.text, /operations-security.js/);
  });

  it("custom LockProvider can be injected", async () => {
    setLockProvider(new MockLockProvider());
    const provider = getLockProvider();
    assert.equal(provider.providerId, "mock");
    const result = await provider.lock();
    assert.equal(result.ok, true);
    resetLockProviderForTests();
    initLockProvider();
  });

  it("resolveLockProviderId reads config", () => {
    assert.equal(resolveLockProviderId(), "switchbot");
  });
});

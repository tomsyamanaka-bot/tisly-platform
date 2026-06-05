import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

import { hashPassword } from "../src/auth/password.js";
import {
  lockSwitchBot,
  resetSwitchBotMockState,
  unlockSwitchBot,
} from "../src/services/switchbotService.js";
import {
  clearPendingArmTimer,
  confirmPendingArmCheck,
  evaluateSecurityArmGate,
  getSecurityState,
} from "../src/services/securityAutomationService.js";
import {
  handleSwitchBotLocked,
  handleSwitchBotUnlocked,
  pollSwitchBotAndBridge,
  resetSwitchBotBridgeState,
} from "../src/services/switchBotSecurityBridge.js";
import { registerPresenceDevice } from "../src/services/securityPresenceService.js";
import {
  resetSecurityAutomationForTests,
  saveAutomationSettings,
  listSecurityEventLogs,
} from "../src/security-automation/security-automation-store.js";
import {
  collectSecurityNotificationCandidates,
  resetSecurityNotificationDispatchForTests,
} from "../src/security-automation/security-notifications.js";
import { runSwitchBotBridgeWorkerTick } from "../src/workers/switchbot-bridge-worker.js";

process.env.JWT_SECRET = "test-phase1341-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1341-1360.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.SWITCHBOT_MODE = "mock";
process.env.SWITCHBOT_TOKEN = "test-token-value";
process.env.SWITCHBOT_SECRET = "test-secret-value";
process.env.SWITCHBOT_LOCK_DEVICE_ID = "mock-lock-001";
process.env.SWITCHBOT_AUTO_ARM_ENABLED = "false";
process.env.SWITCHBOT_AUTO_DISARM_ENABLED = "false";
process.env.SWITCHBOT_WORKER_ENABLED = "false";
process.env.SECURITY_EVENT_LOG_ENABLED = "true";
process.env.SECURITY_UNKNOWN_DEVICE_POLICY = "block_auto_arm";
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

describe("Phase 1341-1360 SwitchBot Real Bridge & Security Polish", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    resetSecurityAutomationForTests();
    resetSwitchBotMockState("unlocked");
    resetSwitchBotBridgeState();
    resetSecurityNotificationDispatchForTests();
    clearPendingArmTimer();
  });

  after(() => {
    clearPendingArmTimer();
    closeDatabase();
  });

  describe("real mode requires confirmed", () => {
    it("real unlock without confirmed is rejected", async () => {
      process.env.SWITCHBOT_MODE = "real";
      const result = await unlockSwitchBot("lock-1", false);
      assert.equal(result.ok, false);
      assert.match(result.message, /confirmed/i);
      process.env.SWITCHBOT_MODE = "mock";
    });

    it("real auto arm without confirmed is skipped", () => {
      resetSecurityAutomationForTests();
      process.env.SWITCHBOT_MODE = "real";
      saveAutomationSettings({
        switchbotIntegrationEnabled: true,
        autoArmEnabled: true,
        realExecutionConfirmed: false,
        delaySeconds: 0,
      });
      registerPresenceDevice({ name: "Away", type: "iphone", presenceStatus: "away" });
      const state = handleSwitchBotLocked();
      assert.notEqual(state.mode, "armed");
      assert.ok(
        listSecurityEventLogs(10).some((l) => l.eventType === "real_command_rejected")
      );
      process.env.SWITCHBOT_MODE = "mock";
    });
  });

  describe("dryRun does not execute command", () => {
    it("dryRun lock command is not executed", async () => {
      process.env.SWITCHBOT_MODE = "dryRun";
      const result = await lockSwitchBot("dry-1", false);
      assert.equal(result.ok, true);
      assert.equal(result.dryRun, true);
      assert.match(result.message, /\[dryRun\]/);
      process.env.SWITCHBOT_MODE = "mock";
    });
  });

  describe("auto arm gate conditions", () => {
    it("locked + all away + auto disabled = skipped", () => {
      resetSecurityAutomationForTests();
      saveAutomationSettings({
        switchbotIntegrationEnabled: true,
        autoArmEnabled: false,
      });
      registerPresenceDevice({ name: "Away", type: "iphone", presenceStatus: "away" });
      resetSwitchBotMockState("locked");
      const state = handleSwitchBotLocked();
      assert.notEqual(state.mode, "armed");
      assert.ok(listSecurityEventLogs(10).some((l) => l.eventType === "auto_arm_skipped"));
    });

    it("locked + all away + auto enabled + confirmed = arm candidate", () => {
      resetSecurityAutomationForTests();
      saveAutomationSettings({
        switchbotIntegrationEnabled: true,
        autoArmEnabled: true,
        realExecutionConfirmed: true,
        delaySeconds: 0,
      });
      registerPresenceDevice({ name: "Away", type: "iphone", presenceStatus: "away" });
      resetSwitchBotMockState("locked");
      const pending = handleSwitchBotLocked();
      assert.equal(pending.mode, "pending_arm");
      const armed = confirmPendingArmCheck();
      assert.equal(armed.mode, "armed");
    });

    it("unknown device blocks auto arm", () => {
      resetSecurityAutomationForTests();
      saveAutomationSettings({
        switchbotIntegrationEnabled: true,
        autoArmEnabled: true,
        delaySeconds: 0,
        unknownDevicePolicy: "block_auto_arm",
      });
      registerPresenceDevice({ name: "Unknown", type: "android", presenceStatus: "unknown" });
      handleSwitchBotLocked();
      const after = confirmPendingArmCheck();
      assert.notEqual(after.mode, "armed");
      assert.ok(
        listSecurityEventLogs(10).some(
          (l) => l.eventType === "unknown_device_blocked" || l.eventType === "auto_arm_blocked"
        )
      );
    });

    it("unlock auto disarm disabled = skipped", () => {
      resetSecurityAutomationForTests();
      saveAutomationSettings({
        switchbotIntegrationEnabled: true,
        autoArmEnabled: true,
        autoDisarmEnabled: false,
        delaySeconds: 0,
      });
      registerPresenceDevice({ name: "Away", type: "iphone", presenceStatus: "away" });
      resetSwitchBotMockState("locked");
      handleSwitchBotLocked();
      confirmPendingArmCheck();
      assert.equal(getSecurityState().mode, "armed");
      const state = handleSwitchBotUnlocked();
      assert.equal(state.mode, "armed");
      assert.ok(listSecurityEventLogs(10).some((l) => l.eventType === "auto_disarm_skipped"));
    });
  });

  describe("bridge worker & poll", () => {
    it("pollSwitchBotAndBridge detects state change", async () => {
      resetSwitchBotBridgeState();
      resetSwitchBotMockState("unlocked");
      await pollSwitchBotAndBridge();
      resetSwitchBotMockState("locked");
      const result = await pollSwitchBotAndBridge();
      assert.equal(result.changed, true);
      assert.equal(result.status.lockState, "locked");
    });

    it("worker tick runs without error", async () => {
      const tick = await runSwitchBotBridgeWorkerTick();
      assert.equal(tick.polled, true);
    });

    it("evaluateSecurityArmGate returns checklist fields", () => {
      const gate = evaluateSecurityArmGate({
        deviceId: "mock",
        lockState: "locked",
        mode: "mock",
        fetchedAt: new Date().toISOString(),
      });
      assert.ok("registeredDevicesAllAway" in gate);
      assert.ok("switchBotLocked" in gate);
      assert.ok("unknownDeviceDetected" in gate);
      assert.ok("manualOverride" in gate);
      assert.ok(Array.isArray(gate.armReasons));
    });
  });

  describe("Security UI & API", () => {
    it("GET /api/security/operations/overview returns SwitchBot card data", async () => {
      const token = await adminLogin();
      const res = await request(app)
        .get("/api/security/operations/overview")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "1361-1380");
      assert.ok(res.body.lockProvider);
      assert.ok(res.body.switchbotMode);
      assert.ok(res.body.armGate);
      assert.ok(res.body.switchbotStatus);
    });

    it("operations.html contains security automation card", async () => {
      const res = await request(app).get("/operations");
      assert.equal(res.status, 200);
      assert.match(res.text, /security-automation-card/);
    });
  });

  describe("notification events", () => {
    it("collectSecurityNotificationCandidates includes switchbot events", () => {
      resetSecurityAutomationForTests();
      handleSwitchBotLocked();
      const candidates = collectSecurityNotificationCandidates();
      assert.ok(candidates.some((c) => c.kind === "switchbot_locked"));
    });
  });
});

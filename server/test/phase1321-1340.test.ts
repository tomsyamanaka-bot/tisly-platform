import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

import { hashPassword } from "../src/auth/password.js";
import { buildDeployDryRun } from "../src/deploy/deploy-dry-run.js";
import {
  createSwitchBotAuthHeaders,
  getSwitchBotMode,
  resetSwitchBotMockState,
  unlockSwitchBot,
} from "../src/services/switchbotService.js";
import {
  clearPendingArmTimer,
  confirmPendingArmCheck,
  evaluatePresenceOnlyChange,
  getSecurityState,
} from "../src/services/securityAutomationService.js";
import {
  handleSwitchBotLocked,
  handleSwitchBotUnlocked,
} from "../src/services/switchBotSecurityBridge.js";
import {
  registerPresenceDevice,
  updateDevicePresence,
} from "../src/services/securityPresenceService.js";
import {
  resetSecurityAutomationForTests,
  saveAutomationSettings,
  listSecurityEventLogs,
} from "../src/security-automation/security-automation-store.js";
import { buildSwitchBotDeploymentChecklist } from "../src/security-automation/switchbot-release-gate.js";

process.env.JWT_SECRET = "test-phase1321-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1321-1340.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.SWITCHBOT_MODE = "mock";
process.env.SWITCHBOT_TOKEN = "test-token-value";
process.env.SWITCHBOT_SECRET = "test-secret-value";
process.env.SWITCHBOT_LOCK_DEVICE_ID = "mock-lock-001";
process.env.SWITCHBOT_AUTO_ARM_ENABLED = "false";
process.env.SWITCHBOT_AUTO_DISARM_ENABLED = "false";
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

describe("Phase 1321-1340 SwitchBot Security Automation", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    resetSecurityAutomationForTests();
    resetSwitchBotMockState("unlocked");
    clearPendingArmTimer();
  });

  after(() => {
    clearPendingArmTimer();
    closeDatabase();
  });

  describe("SwitchBot service", () => {
    it("createSwitchBotAuthHeaders generates sign without logging secrets", () => {
      const headers = createSwitchBotAuthHeaders();
      assert.ok(headers.Authorization);
      assert.ok(headers.sign);
      assert.ok(headers.t);
      assert.ok(headers.nonce);
      const serialized = JSON.stringify(headers);
      assert.ok(!serialized.includes("test-secret-value"));
      assert.equal(headers.Authorization, "test-token-value");
    });

    it("confirmedなしではreal unlock不可", async () => {
      process.env.SWITCHBOT_MODE = "real";
      const result = await unlockSwitchBot("lock-1", false);
      assert.equal(result.ok, false);
      assert.match(result.message, /confirmed/i);
      process.env.SWITCHBOT_MODE = "mock";
    });
  });

  describe("Security automation flow", () => {
    it("locked + all away → pending_arm → armed", () => {
      saveAutomationSettings({
        switchbotIntegrationEnabled: true,
        autoArmEnabled: true,
        delaySeconds: 0,
        unknownDevicePolicy: "block_auto_arm",
      });
      registerPresenceDevice({ name: "Phone A", type: "iphone", presenceStatus: "away" });
      const pending = handleSwitchBotLocked();
      assert.equal(pending.mode, "pending_arm");
      const armed = confirmPendingArmCheck();
      assert.equal(armed.mode, "armed");
      const logs = listSecurityEventLogs(20);
      assert.ok(logs.some((l) => l.message.includes("SwitchBot locked received")));
      assert.ok(logs.some((l) => l.message.includes("Pending arm started")));
      assert.ok(logs.some((l) => l.message.includes("Auto armed by SwitchBot locked + all away")));
    });

    it("locked + one home → armedにならない", () => {
      resetSecurityAutomationForTests();
      saveAutomationSettings({
        switchbotIntegrationEnabled: true,
        autoArmEnabled: true,
        delaySeconds: 0,
      });
      const d = registerPresenceDevice({ name: "Phone Home", type: "iphone", presenceStatus: "home" });
      const state = handleSwitchBotLocked();
      assert.notEqual(state.mode, "armed");
      const after = confirmPendingArmCheck();
      assert.notEqual(after.mode, "armed");
      const logs = listSecurityEventLogs(10);
      assert.ok(logs.some((l) => l.message.includes("Auto arm blocked: device home")));
      updateDevicePresence(d.id, "away");
    });

    it("locked + unknown + block_auto_arm → armedにならない", () => {
      resetSecurityAutomationForTests();
      saveAutomationSettings({
        switchbotIntegrationEnabled: true,
        autoArmEnabled: true,
        delaySeconds: 0,
        unknownDevicePolicy: "block_auto_arm",
      });
      registerPresenceDevice({ name: "Unknown Phone", type: "android", presenceStatus: "unknown" });
      handleSwitchBotLocked();
      const after = confirmPendingArmCheck();
      assert.notEqual(after.mode, "armed");
      assert.ok(
        listSecurityEventLogs(10).some((l) => l.message.includes("Auto arm blocked: unknown device"))
      );
    });

    it("unlocked → disarmed", () => {
      resetSecurityAutomationForTests();
      saveAutomationSettings({
        switchbotIntegrationEnabled: true,
        autoDisarmEnabled: true,
      });
      const state = handleSwitchBotUnlocked();
      assert.equal(state.mode, "disarmed");
      assert.ok(
        listSecurityEventLogs(5).some((l) => l.message.includes("Auto disarmed by SwitchBot unlocked"))
      );
    });

    it("Wi-Fi homeだけでは disarmedにならない", () => {
      resetSecurityAutomationForTests();
      saveAutomationSettings({
        switchbotIntegrationEnabled: true,
        autoArmEnabled: true,
        autoDisarmEnabled: true,
        delaySeconds: 0,
      });
      const d = registerPresenceDevice({ name: "WiFi Phone", type: "iphone", presenceStatus: "away" });
      handleSwitchBotLocked();
      const armed = confirmPendingArmCheck();
      assert.equal(armed.mode, "armed");
      updateDevicePresence(d.id, "home");
      const state = evaluatePresenceOnlyChange(d.id, "home");
      assert.equal(state.mode, "armed");
    });

    it("SecurityEventLogが作成される", () => {
      resetSecurityAutomationForTests();
      handleSwitchBotLocked();
      assert.ok(listSecurityEventLogs(1).length >= 1);
    });
  });

  describe("Release gate & deployment checklist", () => {
    it("release gateがSwitchBot未設定realを止める", () => {
      const report = buildDeployDryRun({
        NODE_ENV: "production",
        TISLY_PUBLIC_URL: "https://tisly.jp",
        SWITCHBOT_MODE: "real",
        SWITCHBOT_TOKEN: "",
        SWITCHBOT_SECRET: "",
        SWITCHBOT_LOCK_DEVICE_ID: "",
        DEMO_RESET_ENABLED: "false",
      });
      const tokenCheck = report.checks.find((c) => c.id === "switchbot_token");
      const secretCheck = report.checks.find((c) => c.id === "switchbot_secret");
      const deviceCheck = report.checks.find((c) => c.id === "switchbot_lock_device_id");
      assert.equal(tokenCheck?.status, "fail");
      assert.equal(secretCheck?.status, "fail");
      assert.equal(deviceCheck?.status, "fail");
      assert.ok(report.summary.fail > 0);
    });

    it("deployment checklistにSwitchBot項目が出る", async () => {
      const items = buildSwitchBotDeploymentChecklist();
      assert.ok(items.some((i) => i.id === "switchbot_mode"));
      assert.ok(items.some((i) => i.id === "switchbot_unlock_guard"));
      const res = await request(app).get("/api/deploy/switchbot-checklist");
      assert.equal(res.status, 200);
      assert.ok(res.body.items.length >= 7);
    });
  });

  describe("API routes", () => {
    it("GET /api/integrations/switchbot/lock/status returns mock status", async () => {
      const res = await request(app).get("/api/integrations/switchbot/lock/status");
      assert.equal(res.status, 200);
      assert.equal(res.body.mode, "mock");
    });

    it("POST unlock without auth returns 401", async () => {
      const res = await request(app)
        .post("/api/integrations/switchbot/lock/unlock")
        .send({ confirmed: true });
      assert.equal(res.status, 401);
    });

    it("POST unlock without confirmed returns 403 in real mode", async () => {
      const token = await adminLogin();
      process.env.SWITCHBOT_MODE = "real";
      const res = await request(app)
        .post("/api/integrations/switchbot/lock/unlock")
        .set("Authorization", `Bearer ${token}`)
        .send({});
      assert.equal(res.status, 403);
      process.env.SWITCHBOT_MODE = "mock";
    });

    it("GET /api/security/state requires admin auth", async () => {
      const token = await adminLogin();
      const res = await request(app)
        .get("/api/security/state")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.state);
    });

    it("POST /api/security/automation/test/lock-away", async () => {
      const token = await adminLogin();
      resetSecurityAutomationForTests();
      saveAutomationSettings({
        switchbotIntegrationEnabled: true,
        autoArmEnabled: true,
        delaySeconds: 0,
      });
      const res = await request(app)
        .post("/api/security/automation/test/lock-away")
        .set("Authorization", `Bearer ${token}`)
        .send({
          delaySeconds: 0,
          devices: [{ name: "Away Phone", type: "iphone", presenceStatus: "away" }],
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.state.mode, "pending_arm");
    });
  });

  describe("HTML routes", () => {
    it("GET /security returns dashboard HTML", async () => {
      const res = await request(app).get("/security");
      assert.equal(res.status, 200);
      assert.match(res.text, /セキュリティ警戒/);
    });

    it("GET /security/settings/automation returns settings HTML", async () => {
      const res = await request(app).get("/security/settings/automation");
      assert.equal(res.status, 200);
      assert.match(res.text, /自動化設定/);
    });
  });
});

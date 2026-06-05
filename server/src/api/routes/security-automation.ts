import { Router } from "express";
import { requireAdminAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { config } from "../../config.js";
import {
  getAutomationSettings,
  saveAutomationSettings,
} from "../../security-automation/security-automation-store.js";
import { collectSecurityNotificationCandidates } from "../../security-automation/security-notifications.js";
import {
  confirmPendingArmCheck,
  createSecurityEventLog,
  evaluatePresenceOnlyChange,
  getAutomationRules,
  getLastSecurityEventLog,
  getSecurityState,
  listSecurityEventLogs,
  setSecurityMode,
  startPendingArmCheck,
  updateAutomationRule,
} from "../../services/securityAutomationService.js";
import {
  getPresenceSummary,
  getRegisteredDevices,
  registerPresenceDevice,
  updateDevicePresence,
} from "../../services/securityPresenceService.js";
import {
  handleSwitchBotLocked,
  handleSwitchBotUnlocked,
} from "../../services/switchBotSecurityBridge.js";
import {
  getSwitchBotLockStatus,
  getSwitchBotMode,
  isRealUnlockGuarded,
} from "../../services/switchbotService.js";

export const securityAutomationRouter = Router();

securityAutomationRouter.use(requireAdminAuth);

securityAutomationRouter.get("/state", (_req, res) => {
  const state = getSecurityState();
  const lastLog = getLastSecurityEventLog();
  res.json({
    state,
    lastLog,
    switchbotMode: getSwitchBotMode(),
    notifications: collectSecurityNotificationCandidates(),
  });
});

securityAutomationRouter.post("/state/arm", (req: AuthedRequest, res) => {
  const reason = req.body?.reason ? String(req.body.reason) : "Manual arm";
  const state = setSecurityMode("armed", reason, "manual", req.admin?.username ?? "admin");
  res.json({ ok: true, state });
});

securityAutomationRouter.post("/state/disarm", (req: AuthedRequest, res) => {
  const reason = req.body?.reason ? String(req.body.reason) : "Manual disarm";
  const state = setSecurityMode("disarmed", reason, "manual", req.admin?.username ?? "admin");
  res.json({ ok: true, state });
});

securityAutomationRouter.get("/presence/devices", (_req, res) => {
  res.json({
    devices: getRegisteredDevices(),
    summary: getPresenceSummary(),
  });
});

securityAutomationRouter.post("/presence/devices", (req, res) => {
  const body = req.body ?? {};
  if (!body.name || !body.type) {
    res.status(400).json({ error: "name and type required" });
    return;
  }
  const device = registerPresenceDevice({
    name: String(body.name),
    type: body.type,
    ownerName: body.ownerName ? String(body.ownerName) : "",
    macAddress: body.macAddress ? String(body.macAddress) : undefined,
    ipAddress: body.ipAddress ? String(body.ipAddress) : undefined,
    enabled: body.enabled !== false,
    presenceStatus: body.presenceStatus ?? "unknown",
  });
  res.status(201).json(device);
});

securityAutomationRouter.patch("/presence/devices/:id", (req, res) => {
  const id = String(req.params.id);
  const body = req.body ?? {};
  if (body.presenceStatus) {
    const updated = updateDevicePresence(id, body.presenceStatus);
    if (!updated) {
      res.status(404).json({ error: "device not found" });
      return;
    }
    evaluatePresenceOnlyChange(id, body.presenceStatus);
    res.json(updated);
    return;
  }
  const device = registerPresenceDevice({
    id,
    name: body.name ? String(body.name) : "Device",
    type: body.type ?? "other",
    ownerName: body.ownerName ? String(body.ownerName) : "",
    enabled: body.enabled !== false,
    presenceStatus: body.presenceStatus,
  });
  res.json(device);
});

securityAutomationRouter.get("/automation/rules", (_req, res) => {
  res.json({ rules: getAutomationRules(), settings: getAutomationSettings() });
});

securityAutomationRouter.patch("/automation/rules/:id", (req, res) => {
  const updated = updateAutomationRule(String(req.params.id), req.body ?? {});
  if (!updated) {
    res.status(404).json({ error: "rule not found" });
    return;
  }
  if (req.body?.delaySeconds !== undefined || req.body?.unknownDevicePolicy !== undefined) {
    saveAutomationSettings({
      delaySeconds: req.body.delaySeconds ?? getAutomationSettings().delaySeconds,
      unknownDevicePolicy:
        req.body.unknownDevicePolicy ?? getAutomationSettings().unknownDevicePolicy,
      autoArmEnabled:
        req.body.autoArmEnabled ?? config.switchbot.autoArmEnabled
          ? true
          : getAutomationSettings().autoArmEnabled,
      autoDisarmEnabled:
        req.body.autoDisarmEnabled ?? getAutomationSettings().autoDisarmEnabled,
      switchbotIntegrationEnabled:
        req.body.switchbotIntegrationEnabled ?? getAutomationSettings().switchbotIntegrationEnabled,
    });
  }
  res.json(updated);
});

securityAutomationRouter.patch("/automation/settings", (req, res) => {
  const body = req.body ?? {};
  const settings = saveAutomationSettings({
    switchbotIntegrationEnabled: body.switchbotIntegrationEnabled,
    autoArmEnabled: body.autoArmEnabled,
    autoDisarmEnabled: body.autoDisarmEnabled,
    delaySeconds: body.delaySeconds,
    unknownDevicePolicy: body.unknownDevicePolicy,
  });
  res.json(settings);
});

securityAutomationRouter.post("/automation/switchbot/locked", (_req, res) => {
  const state = handleSwitchBotLocked();
  res.json({ ok: true, state, logs: listSecurityEventLogs(5) });
});

securityAutomationRouter.post("/automation/switchbot/unlocked", (_req, res) => {
  const state = handleSwitchBotUnlocked();
  res.json({ ok: true, state, logs: listSecurityEventLogs(5) });
});

securityAutomationRouter.post("/automation/evaluate", async (_req, res) => {
  const status = await getSwitchBotLockStatus();
  res.json({ status, state: getSecurityState() });
});

securityAutomationRouter.post("/automation/test/lock-away", (req, res) => {
  const body = req.body ?? {};
  if (body.delaySeconds !== undefined) {
    const rule = getAutomationRules().find((r) => r.triggerType === "switchbot_locked");
    if (rule) {
      updateAutomationRule(rule.id, { delaySeconds: Number(body.delaySeconds) });
      saveAutomationSettings({ delaySeconds: Number(body.delaySeconds) });
    }
  }
  saveAutomationSettings({
    switchbotIntegrationEnabled: true,
    autoArmEnabled: true,
  });
  if (Array.isArray(body.devices)) {
    for (const d of body.devices) {
      registerPresenceDevice({
        name: d.name ?? "Test device",
        type: d.type ?? "iphone",
        presenceStatus: d.presenceStatus ?? "away",
        enabled: true,
      });
    }
  }
  const state = handleSwitchBotLocked();
  res.json({ ok: true, state, pending: startPendingArmCheck() });
});

securityAutomationRouter.post("/automation/test/unlock", (_req, res) => {
  saveAutomationSettings({
    switchbotIntegrationEnabled: true,
    autoDisarmEnabled: true,
  });
  const state = handleSwitchBotUnlocked();
  res.json({ ok: true, state });
});

securityAutomationRouter.post("/automation/test/confirm-pending-arm", (_req, res) => {
  const state = confirmPendingArmCheck();
  res.json({ ok: true, state });
});

securityAutomationRouter.get("/automation/logs", (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json({ logs: listSecurityEventLogs(limit) });
});

securityAutomationRouter.get("/automation/release-check", (_req, res) => {
  res.json({
    switchbotMode: getSwitchBotMode(),
    realUnlockGuarded: isRealUnlockGuarded(),
    eventLogEnabled: config.securityAutomation.eventLogEnabled,
    settings: getAutomationSettings(),
    state: getSecurityState(),
  });
});

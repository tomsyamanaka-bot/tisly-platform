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
  evaluateSecurityArmGate,
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
  getSwitchBotBridgeWorkerState,
  handleSwitchBotLocked,
  handleSwitchBotUnlocked,
  pollSwitchBotAndBridge,
} from "../../services/switchBotSecurityBridge.js";
import { getLockProvider, resolveLockProviderId } from "../../providers/lock/index.js";
import {
  generateMockLockEvent,
  getLockProviderDashboardAsync,
  listFaceLockEvents,
  listLockEvents,
} from "../../services/lockEventService.js";
import {
  getFamilyPresenceOverview,
  listChildArrivalNotifications,
  listPresenceUsers,
} from "../../services/familyPresenceService.js";
import {
  isRealUnlockGuarded,
  verifySwitchBotDryRunConnection,
} from "../../services/switchbotService.js";

export const securityAutomationRouter = Router();

securityAutomationRouter.use(requireAdminAuth);

securityAutomationRouter.get("/state", async (_req, res) => {
  const state = getSecurityState();
  const lastLog = getLastSecurityEventLog();
  const provider = getLockProvider();
  const lockDashboard = await getLockProviderDashboardAsync();
  res.json({
    state,
    lastLog,
    lockProvider: resolveLockProviderId(),
    switchbotMode: provider.getMode?.() ?? "mock",
    lock: lockDashboard,
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
  const status = await getLockProvider().getStatus();
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
    lockProvider: resolveLockProviderId(),
    switchbotMode: getLockProvider().getMode?.() ?? "mock",
    realUnlockGuarded: isRealUnlockGuarded(),
    eventLogEnabled: config.securityAutomation.eventLogEnabled,
    settings: getAutomationSettings(),
    state: getSecurityState(),
  });
});

/** Operations Security タブ — SwitchBot 状態カード用 */
securityAutomationRouter.get("/operations/overview", async (_req, res) => {
  const rawStatus = await getLockProvider().getStatus();
  const status = {
    deviceId: rawStatus.deviceId,
    lockState: rawStatus.lockState,
    battery: rawStatus.battery,
    mode: rawStatus.mode ?? getLockProvider().getMode?.() ?? "mock",
    fetchedAt: rawStatus.fetchedAt,
    error: rawStatus.error,
  };
  const gate = evaluateSecurityArmGate(status);
  const settings = getAutomationSettings();
  const mode = getLockProvider().getMode?.() ?? "mock";
  const worker = getSwitchBotBridgeWorkerState();
  const dangerous =
    mode === "real" &&
    (settings.autoArmEnabled || settings.autoDisarmEnabled) &&
    settings.realExecutionConfirmed;

  const lockDashboard = await getLockProviderDashboardAsync();
  res.json({
    phase: "1361-1380",
    lockProvider: resolveLockProviderId(),
    switchbotMode: mode,
    lock: lockDashboard,
    switchbotStatus: status,
    worker,
    securityState: getSecurityState(),
    settings: {
      autoArmEnabled: settings.autoArmEnabled,
      autoDisarmEnabled: settings.autoDisarmEnabled,
      manualOverride: settings.manualOverride,
      realExecutionConfirmed: settings.realExecutionConfirmed,
      switchbotIntegrationEnabled: settings.switchbotIntegrationEnabled,
    },
    armGate: gate,
    presence: getPresenceSummary(),
    notifications: collectSecurityNotificationCandidates(),
    dangerousSettings: dangerous,
    envAutoArm: config.switchbot.autoArmEnabled,
    envAutoDisarm: config.switchbot.autoDisarmEnabled,
  });
});

securityAutomationRouter.post("/operations/dry-run-verify", async (_req, res) => {
  const result = await verifySwitchBotDryRunConnection();
  if (!result.ok) {
    createSecurityEventLog({
      eventType: "switchbot_status_failed",
      source: "switchbot",
      message: result.message,
      beforeMode: getSecurityState().mode,
      afterMode: getSecurityState().mode,
      metadata: { dryRunVerify: true },
    });
  }
  res.json(result);
});

securityAutomationRouter.post("/operations/real-confirm", (req: AuthedRequest, res) => {
  const body = req.body ?? {};
  if (body.confirmed !== true) {
    res.status(400).json({ error: "confirmed=true required" });
    return;
  }
  if ((getLockProvider().getMode?.() ?? "mock") !== "real") {
    res.status(400).json({ error: "SWITCHBOT_MODE must be real" });
    return;
  }
  const settings = saveAutomationSettings({ realExecutionConfirmed: true });
  createSecurityEventLog({
    eventType: "real_execution_confirmed",
    source: "manual",
    message: `Real execution confirmed by ${req.admin?.username ?? "admin"}`,
    beforeMode: getSecurityState().mode,
    afterMode: getSecurityState().mode,
    metadata: { confirmedBy: req.admin?.username },
  });
  res.json({ ok: true, settings });
});

securityAutomationRouter.post("/operations/real-revoke", (req: AuthedRequest, res) => {
  const settings = saveAutomationSettings({ realExecutionConfirmed: false });
  createSecurityEventLog({
    eventType: "real_execution_revoked",
    source: "manual",
    message: `Real execution revoked by ${req.admin?.username ?? "admin"}`,
    beforeMode: getSecurityState().mode,
    afterMode: getSecurityState().mode,
    metadata: {},
  });
  res.json({ ok: true, settings });
});

securityAutomationRouter.post("/operations/poll", async (_req, res) => {
  const result = await pollSwitchBotAndBridge();
  res.json(result);
});

securityAutomationRouter.patch("/operations/manual-override", (req, res) => {
  const body = req.body ?? {};
  const settings = saveAutomationSettings({
    manualOverride: body.enabled === true,
  });
  res.json(settings);
});

/** Phase 1361–1380 — Lock events & family presence */
securityAutomationRouter.get("/lock/overview", async (_req, res) => {
  res.json(await getLockProviderDashboardAsync());
});

securityAutomationRouter.get("/lock/events", (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json({ events: listLockEvents(limit) });
});

securityAutomationRouter.get("/lock/face-events", (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json({ events: listFaceLockEvents(limit) });
});

securityAutomationRouter.get("/presence/users", (_req, res) => {
  res.json({ users: listPresenceUsers(), overview: getFamilyPresenceOverview() });
});

securityAutomationRouter.get("/family/notifications", (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json({ notifications: getFamilyPresenceOverview().recentNotifications.slice(0, limit) });
});

securityAutomationRouter.get("/family/child-arrivals", (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json({ arrivals: listChildArrivalNotifications(limit) });
});

securityAutomationRouter.post("/lock/mock/:scenario", (req, res) => {
  const scenario = String(req.params.scenario) as
    | "child_arrival"
    | "father_arrival"
    | "guest_unlock"
    | "unknown_unlock";
  const valid = ["child_arrival", "father_arrival", "guest_unlock", "unknown_unlock"];
  if (!valid.includes(scenario)) {
    res.status(400).json({ error: `scenario must be one of: ${valid.join(", ")}` });
    return;
  }
  const event = generateMockLockEvent(scenario);
  res.json({
    ok: true,
    event,
    state: getSecurityState(),
    family: getFamilyPresenceOverview(),
  });
});

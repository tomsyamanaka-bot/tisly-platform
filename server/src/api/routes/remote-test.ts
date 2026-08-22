import { Router, type NextFunction, type Request, type Response } from "express";
import { config } from "../../config.js";
import {
  countPushSubscriptions,
  sendWebPush,
} from "../../notification/channels/web-push.js";
import { notifyChStateChanges } from "../../remote-test/remote-test-ch-notify.js";
import {
  processSecurityInputChanges,
  notifySecurityModeChange,
} from "../../remote-test/security-demo-notify.js";
import { processHomeSecurityInputChangesV1 } from "../../home/home-security-notify-v1.js";
import { HOME_ITABASHI_LIVE_SITE_ID_V1 } from "../../home/home-sites-v1.js";
import {
  getSecurityDemoStatus,
  setSecurityMode,
} from "../../remote-test/security-demo-state.js";
import { loadSecurityDemoConfig } from "../../remote-test/security-demo-config.js";
import {
  CHANNEL_COUNT,
  applySimulatedInputChange,
  consumePendingCommand,
  getDeviceStatus,
  getRemoteTestDebugInfo,
  getRemoteTestStatus,
  markPushResult,
  normalizeDeviceChStates,
  normalizeDeviceInputStates,
  queueChCommand,
  queueChPulseCommand,
  recordDeviceHeartbeat,
  recordHeartbeatDebug,
  recordWebAccess,
} from "../../remote-test/remote-test-state.js";

export const remoteTestRouter = Router();

const REMOTE_TEST_USER_ID = "remote-test";
const NOTIFY_BODY = "TiSLY 通知テスト成功";
const NOTIFY_TITLE = "TiSLY Remote Test";

function extractToken(req: Request): string {
  const header = req.header("X-Remote-Test-Token")?.trim();
  if (header) return header;
  const auth = req.header("Authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const query = typeof req.query.token === "string" ? req.query.token.trim() : "";
  return query;
}

export function requireRemoteTestToken(req: Request, res: Response, next: NextFunction): void {
  const expected = config.remoteTest.token;
  if (!expected) {
    res.status(503).json({ error: "REMOTE_TEST_TOKEN is not configured on server" });
    return;
  }
  const provided = extractToken(req);
  if (!provided || provided !== expected) {
    res.status(403).json({ error: "Invalid or missing remote test token" });
    return;
  }
  next();
}

function clientIp(req: Request): string {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  const ip = req.ip ?? req.socket?.remoteAddress;
  return typeof ip === "string" ? ip : "unknown";
}

function trackWebAccess(req: Request): void {
  recordWebAccess(clientIp(req));
}

function safeSubscriptionCount(): number {
  try {
    return countPushSubscriptions(REMOTE_TEST_USER_ID);
  } catch {
    return 0;
  }
}

function pushStatusExtras() {
  const vapidConfigured = !!(config.vapid.publicKey && config.vapid.privateKey);
  return {
    push: {
      vapidConfigured,
      subscriptionCount: safeSubscriptionCount(),
    },
  };
}

remoteTestRouter.use(requireRemoteTestToken);

function securityDemoExtras() {
  return {
    ...getSecurityDemoStatus(),
    securityDemoConfig: {
      deviceName: loadSecurityDemoConfig().deviceName,
      inputs: loadSecurityDemoConfig().inputs,
    },
  };
}

remoteTestRouter.get("/status", (req, res) => {
  trackWebAccess(req);
  res.json({ ok: true, ...getRemoteTestStatus(), ...pushStatusExtras(), ...securityDemoExtras() });
});

remoteTestRouter.post("/arm", async (req, res) => {
  trackWebAccess(req);
  const { mode, changed } = setSecurityMode("ARM");
  if (changed) await notifySecurityModeChange(mode);
  res.json({ ok: true, changed, ...getRemoteTestStatus(), ...securityDemoExtras() });
});

remoteTestRouter.post("/disarm", async (req, res) => {
  trackWebAccess(req);
  const { mode, changed } = setSecurityMode("DISARM");
  if (changed) await notifySecurityModeChange(mode);
  res.json({ ok: true, changed, ...getRemoteTestStatus(), ...securityDemoExtras() });
});

remoteTestRouter.post("/demo/intrusion-simulation", async (req, res) => {
  trackWebAccess(req);
  const change = { input: 1, from: "off" as const, to: "on" as const };
  applySimulatedInputChange(change);
  await processSecurityInputChanges([change]);
  res.json({
    ok: true,
    simulated: change,
    ...getRemoteTestStatus(),
    ...securityDemoExtras(),
  });
});

remoteTestRouter.post("/notify", async (req, res) => {
  trackWebAccess(req);
  const payload = {
    title: NOTIFY_TITLE,
    body: NOTIFY_BODY,
    eventType: "remote_test",
    deviceId: "remote-test",
    url: "/remote-test",
  };

  let webPush: Awaited<ReturnType<typeof sendWebPush>> = {
    channel: "web_push",
    success: false,
    error: "not attempted",
  };
  try {
    webPush = await sendWebPush(payload, REMOTE_TEST_USER_ID);
  } catch (err) {
    webPush = {
      channel: "web_push",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  markPushResult(webPush.success, webPush.error);

  const vapidConfigured = !!(config.vapid.publicKey && config.vapid.privateKey);
  const subscriptionCount = safeSubscriptionCount();

  let hint: string | undefined;
  if (!webPush.success) {
    if (!vapidConfigured) {
      hint = "VAPID 未設定 — server で npm run vapid:setup を実行して再起動";
    } else if (subscriptionCount === 0) {
      hint = "Push 未登録 — iPhone: Safari → ホーム画面に追加 → Push 登録";
    } else {
      hint = webPush.error ?? "Push 送信失敗";
    }
  }

  res.json({
    ok: webPush.success,
    message: NOTIFY_BODY,
    primaryChannel: webPush.success ? "web_push" : null,
    channels: { web_push: webPush },
    lastPushSuccessAt: getRemoteTestStatus().lastPushSuccessAt,
    push: {
      vapidConfigured,
      subscriptionCount,
      lastResult: getRemoteTestStatus().lastPushResult,
      lastSuccessAt: getRemoteTestStatus().lastPushSuccessAt,
    },
    hint,
  });
});

for (let ch = 1; ch <= CHANNEL_COUNT; ch++) {
  remoteTestRouter.post(`/ch${ch}/on`, (req, res) => {
    trackWebAccess(req);
    queueChCommand(ch, true);
    const status = getRemoteTestStatus();
    res.json({
      ok: true,
      command: `ch${ch}_on`,
      channel: ch,
      pendingCommand: status.pendingCommand,
      // confirmedChStates: heartbeat で確定した実機状態（楽観更新しない）
      chStates: status.chStates,
      ch1State: status.ch1State,
      lastCommand: status.lastCommand,
      lastCommandAt: status.lastCommandAt,
      lastPollAt: status.lastPollAt,
      lastNotifyAt: status.lastNotifyAt,
      lastPushSuccessAt: status.lastPushSuccessAt,
      lastPushResult: status.lastPushResult,
      lastAccessIp: status.lastAccessIp,
      logs: status.logs,
      notificationHistory: status.notificationHistory,
      ...pushStatusExtras(),
    });
  });

  remoteTestRouter.post(`/ch${ch}/off`, (req, res) => {
    trackWebAccess(req);
    queueChCommand(ch, false);
    const status = getRemoteTestStatus();
    res.json({
      ok: true,
      command: `ch${ch}_off`,
      channel: ch,
      pendingCommand: status.pendingCommand,
      chStates: status.chStates,
      ch1State: status.ch1State,
      lastCommand: status.lastCommand,
      lastCommandAt: status.lastCommandAt,
      lastPollAt: status.lastPollAt,
      lastNotifyAt: status.lastNotifyAt,
      lastPushSuccessAt: status.lastPushSuccessAt,
      lastPushResult: status.lastPushResult,
      lastAccessIp: status.lastAccessIp,
      logs: status.logs,
      notificationHistory: status.notificationHistory,
      ...pushStatusExtras(),
    });
  });

  remoteTestRouter.post(`/ch${ch}/pulse`, (req, res) => {
    trackWebAccess(req);
    const durationMs = Number(req.body?.durationMs ?? 500);
    try {
      const pulsed = queueChPulseCommand(ch, durationMs);
      const status = getRemoteTestStatus();
      res.json({
        ok: true,
        ...pulsed,
        pendingCommand: status.pendingCommand,
        chStates: status.chStates,
        ch1State: status.ch1State,
        lastCommand: status.lastCommand,
        lastCommandAt: status.lastCommandAt,
        lastPollAt: status.lastPollAt,
        logs: status.logs,
        ...pushStatusExtras(),
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

remoteTestRouter.get("/device", (req, res) => {
  trackWebAccess(req);
  res.json({ ok: true, ...getDeviceStatus() });
});

remoteTestRouter.get("/debug", (req, res) => {
  trackWebAccess(req);
  res.json({
    ok: true,
    ...getRemoteTestDebugInfo(),
    subscriptionCount: safeSubscriptionCount(),
  });
});

function logHeartbeatRequest(req: Request): void {
  const rawBody = (req as Request & { rawBody?: string }).rawBody;
  console.log("[heartbeat]");
  console.log(`[heartbeat] method=${req.method}`);
  console.log("[heartbeat] headers=", JSON.stringify(req.headers));
  console.log("[heartbeat] query=", JSON.stringify(req.query));
  console.log("[heartbeat] body=", JSON.stringify(req.body ?? null));
  console.log(`[heartbeat] rawBody=${rawBody ?? ""}`);
}

function extractHeartbeatFirmware(req: Request): string | undefined {
  const fromQuery = typeof req.query.firmware === "string" ? req.query.firmware.trim() : "";
  if (fromQuery) return fromQuery;
  const body = req.body;
  if (body && typeof body === "object" && typeof (body as Record<string, unknown>).firmware === "string") {
    return ((body as Record<string, unknown>).firmware as string).trim();
  }
  const raw = (req as Request & { rawBody?: string }).rawBody;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.firmware === "string" && parsed.firmware.trim()) {
        return parsed.firmware.trim();
      }
    } catch {
      /* invalid JSON */
    }
  }
  return undefined;
}

function extractHeartbeatChStates(req: Request) {
  const fromNested = normalizeDeviceChStates(req.body?.chStates);
  if (fromNested) return fromNested;

  const raw = (req as Request & { rawBody?: string }).rawBody;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const fromRaw = normalizeDeviceChStates(parsed.chStates ?? parsed);
      if (fromRaw) return fromRaw;
    } catch {
      /* invalid JSON body */
    }
  }

  if (typeof req.query.chStates === "string") {
    try {
      const fromQuery = normalizeDeviceChStates(JSON.parse(req.query.chStates));
      if (fromQuery) return fromQuery;
    } catch {
      /* invalid query JSON */
    }
  }

  return null;
}

function extractHeartbeatInputStates(req: Request) {
  const fromNested = normalizeDeviceInputStates(req.body?.inputStates);
  if (fromNested) return fromNested;

  const raw = (req as Request & { rawBody?: string }).rawBody;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const fromRaw = normalizeDeviceInputStates(parsed.inputStates);
      if (fromRaw) return fromRaw;
    } catch {
      /* invalid JSON body */
    }
  }

  if (typeof req.query.inputStates === "string") {
    try {
      const fromQuery = normalizeDeviceInputStates(JSON.parse(req.query.inputStates));
      if (fromQuery) return fromQuery;
    } catch {
      /* invalid query JSON */
    }
  }

  return null;
}

async function handleDeviceHeartbeat(req: Request, res: Response): Promise<void> {
  logHeartbeatRequest(req);
  recordHeartbeatDebug(req.method, req.body ?? null);

  const firmware = extractHeartbeatFirmware(req);
  const chStates = extractHeartbeatChStates(req);
  const inputStates = extractHeartbeatInputStates(req);
  const { chChanges, inputChanges } = recordDeviceHeartbeat(
    firmware || undefined,
    chStates ?? undefined,
    inputStates ?? undefined
  );
  const notificationTriggered = chChanges.length > 0 || inputChanges.length > 0;
  if (chChanges.length > 0) {
    console.log("[remote-test] heartbeat: invoking notifyChStateChanges", chChanges);
    await notifyChStateChanges(chChanges);
  }
  if (inputChanges.length > 0) {
    console.log("[remote-test] heartbeat: invoking processSecurityInputChanges", inputChanges);
    await processSecurityInputChanges(inputChanges);
    await processHomeSecurityInputChangesV1(
      HOME_ITABASHI_LIVE_SITE_ID_V1,
      inputChanges.map((c) => ({
        input: c.input,
        from: c.from,
        to: c.to,
      }))
    );
  }
  const status = getRemoteTestStatus();
  res.json({
    ok: true,
    ...getDeviceStatus(),
    heartbeatAt: new Date().toISOString(),
    chStateChanges: chChanges,
    inputStateChanges: inputChanges,
    notificationTriggered,
    notificationHistoryCount: status.notificationHistory.length,
    lastPushResult: status.lastPushResult,
  });
}

remoteTestRouter.get("/heartbeat", handleDeviceHeartbeat);

remoteTestRouter.post("/heartbeat", handleDeviceHeartbeat);

remoteTestRouter.get("/command", (req, res) => {
  const command = consumePendingCommand();
  const status = getRemoteTestStatus();
  res.json({
    ok: true,
    command,
    chStates: status.chStates,
    ch1State: status.ch1State,
    polledAt: new Date().toISOString(),
  });
});

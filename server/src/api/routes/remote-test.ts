import { Router, type NextFunction, type Request, type Response } from "express";
import { config } from "../../config.js";
import {
  countPushSubscriptions,
  sendWebPush,
} from "../../notification/channels/web-push.js";
import { notifyChStateChanges } from "../../remote-test/remote-test-ch-notify.js";
import {
  CHANNEL_COUNT,
  consumePendingCommand,
  getDeviceStatus,
  getRemoteTestStatus,
  markPushResult,
  normalizeDeviceChStates,
  queueChCommand,
  recordDeviceHeartbeat,
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

remoteTestRouter.get("/status", (req, res) => {
  trackWebAccess(req);
  res.json({ ok: true, ...getRemoteTestStatus(), ...pushStatusExtras() });
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
    res.json({
      ok: true,
      command: `ch${ch}_on`,
      channel: ch,
      ...getRemoteTestStatus(),
      ...pushStatusExtras(),
    });
  });

  remoteTestRouter.post(`/ch${ch}/off`, (req, res) => {
    trackWebAccess(req);
    queueChCommand(ch, false);
    res.json({
      ok: true,
      command: `ch${ch}_off`,
      channel: ch,
      ...getRemoteTestStatus(),
      ...pushStatusExtras(),
    });
  });
}

remoteTestRouter.get("/device", (req, res) => {
  trackWebAccess(req);
  res.json({ ok: true, ...getDeviceStatus() });
});

async function handleDeviceHeartbeat(req: Request, res: Response): Promise<void> {
  const firmware =
    typeof req.query.firmware === "string" ? req.query.firmware.trim() : undefined;
  const chStates = normalizeDeviceChStates(req.body?.chStates);
  const changes = recordDeviceHeartbeat(firmware || undefined, chStates ?? undefined);
  if (changes.length > 0) {
    await notifyChStateChanges(changes);
  }
  res.json({
    ok: true,
    ...getDeviceStatus(),
    heartbeatAt: new Date().toISOString(),
    chStateChanges: changes,
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

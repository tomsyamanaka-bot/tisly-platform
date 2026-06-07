import { Router, type NextFunction, type Request, type Response } from "express";
import { config } from "../../config.js";
import { sendWebPush } from "../../notification/channels/web-push.js";
import { sendDiscord } from "../../notification/channels/discord.js";
import {
  consumePendingCommand,
  getRemoteTestStatus,
  markNotifySent,
  queueCh1Command,
  recordWebAccess,
} from "../../remote-test/remote-test-state.js";

export const remoteTestRouter = Router();

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

async function sendDiscordDirect(body: string): Promise<{ ok: boolean; error?: string }> {
  const webhook = config.discord.webhookUrl;
  if (!webhook) {
    return { ok: false, error: "DISCORD_WEBHOOK_URL not set" };
  }
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: body }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

remoteTestRouter.use(requireRemoteTestToken);

remoteTestRouter.get("/status", (req, res) => {
  trackWebAccess(req);
  res.json({ ok: true, ...getRemoteTestStatus() });
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
  let discordPlatform: Awaited<ReturnType<typeof sendDiscord>> = {
    channel: "discord",
    success: false,
    error: "not attempted",
  };

  try {
    webPush = await sendWebPush(payload, "remote-test");
  } catch (err) {
    webPush = {
      channel: "web_push",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const discordDirect = await sendDiscordDirect(NOTIFY_BODY);

  if (!discordDirect.ok) {
    try {
      discordPlatform = await sendDiscord(payload);
    } catch (err) {
      discordPlatform = {
        channel: "discord",
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const channels = {
    web_push: webPush,
    discord_direct: discordDirect,
    discord_platform: discordPlatform,
  };

  const anySuccess =
    webPush.success || discordDirect.ok || discordPlatform.success;

  if (anySuccess) {
    markNotifySent();
  }

  res.json({
    ok: anySuccess,
    message: NOTIFY_BODY,
    channels,
    hint: anySuccess
      ? undefined
      : "Web Push: PWA登録(userId=remote-test) + VAPID / Discord: DISCORD_WEBHOOK_URL を .env に設定",
  });
});

remoteTestRouter.post("/ch1/on", (req, res) => {
  trackWebAccess(req);
  queueCh1Command("ch1_on");
  res.json({ ok: true, command: "ch1_on", ...getRemoteTestStatus() });
});

remoteTestRouter.post("/ch1/off", (req, res) => {
  trackWebAccess(req);
  queueCh1Command("ch1_off");
  res.json({ ok: true, command: "ch1_off", ...getRemoteTestStatus() });
});

remoteTestRouter.get("/command", (_req, res) => {
  const command = consumePendingCommand();
  res.json({
    ok: true,
    command,
    ch1State: getRemoteTestStatus().ch1State,
    polledAt: new Date().toISOString(),
  });
});

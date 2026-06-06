/**
 * Phase 1461–1500 — 5分毎 /api/health 監視 + 異常時アラート
 */

import cron from "node-cron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { sendDiscord } from "../notification/channels/discord.js";
import { sendWebPush } from "../notification/channels/web-push.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..", "..");
const LOG_FILE = path.join(serverRoot, "data", "health-monitor.log");

let cronTask: cron.ScheduledTask | null = null;
let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;

export interface HealthProbeResult {
  ok: boolean;
  status: string;
  issues: string[];
  checkedAt: string;
}

export function probeHealth(): HealthProbeResult {
  const issues: string[] = [];
  try {
    getDatabase().prepare("SELECT 1").get();
  } catch {
    issues.push("database unreachable");
  }

  if (!config.publicUrl.startsWith("https://")) {
    issues.push("production URL not HTTPS");
  }

  const memFree = process.memoryUsage().heapUsed / process.memoryUsage().heapTotal;
  if (memFree > 0.95) {
    issues.push("heap pressure high");
  }

  const ok = issues.length === 0;
  return {
    ok,
    status: ok ? "ok" : "degraded",
    issues,
    checkedAt: new Date().toISOString(),
  };
}

function appendLog(line: string): void {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`, "utf8");
}

async function sendAlerts(probe: HealthProbeResult): Promise<void> {
  const now = Date.now();
  if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;
  lastAlertAt = now;

  const body = `Health 異常: ${probe.issues.join(", ")} · ${config.publicUrl}`;
  appendLog(`ALERT ${body}`);

  const payload = {
    eventType: "health_monitor_alert",
    title: "TiSLY Health Monitor",
    body,
  };

  const webhook = config.discord.webhookUrl;
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [
            {
              title: payload.title,
              description: payload.body,
              color: 0xff0000,
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
      if (!res.ok) appendLog(`discord HTTP ${res.status}`);
    } catch (e) {
      appendLog(`discord error: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    await sendDiscord(payload).catch((e) => {
      appendLog(`discord platform: ${e}`);
    });
  }

  await sendWebPush(payload).catch((e) => {
    appendLog(`web_push: ${e}`);
  });
}

async function runCheck(): Promise<void> {
  const probe = probeHealth();
  if (probe.ok) {
    appendLog("ok");
    return;
  }
  appendLog(`degraded: ${probe.issues.join("; ")}`);
  await sendAlerts(probe);
}

export function startHealthMonitor(): void {
  stopHealthMonitor();
  if (process.env.NODE_ENV === "test") return;
  if (process.env.HEALTH_MONITOR_ENABLED !== "true") {
    console.log("[HealthMonitor] disabled (HEALTH_MONITOR_ENABLED!=true)");
    return;
  }

  const expr = process.env.HEALTH_MONITOR_CRON || "*/5 * * * *";
  if (!cron.validate(expr)) {
    console.error(`[HealthMonitor] invalid cron: ${expr}`);
    return;
  }

  cronTask = cron.schedule(expr, () => {
    void runCheck();
  });
  console.log(`[HealthMonitor] started (${expr})`);
}

export function stopHealthMonitor(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
}

export function getHealthMonitorLogTail(lines = 20): string[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    return fs
      .readFileSync(LOG_FILE, "utf8")
      .trim()
      .split("\n")
      .slice(-lines);
  } catch {
    return [];
  }
}

import { Router } from "express";
import { getPlatformSetting, setPlatformSetting } from "../../db/database.js";
import { logAudit } from "../../provisioning/audit-log.js";

export const settingsRouter = Router();

const KEYS = [
  "pwa",
  "push",
  "discord",
  "email",
  "tv",
  "heartbeat",
  "retention",
  "backup",
  "qnap",
] as const;

settingsRouter.get("/platform", (_req, res) => {
  const settings: Record<string, unknown> = {};
  for (const key of KEYS) {
    settings[key] = getPlatformSetting(key);
  }
  res.json({ settings });
});

settingsRouter.put("/platform/:key", (req, res) => {
  const key = req.params.key;
  if (!KEYS.includes(key as (typeof KEYS)[number])) {
    res.status(400).json({ error: "Invalid setting key" });
    return;
  }
  setPlatformSetting(key, req.body);
  logAudit({
    action: "settings.update",
    entityType: "platform_setting",
    entityId: key,
    details: req.body,
    actorLabel: req.body?.actorLabel ?? "Operator",
  });
  res.json({ ok: true, key, value: req.body });
});

settingsRouter.get("/rc1", (_req, res) => {
  res.json({
    retention: getPlatformSetting<{ days: number }>("retention") ?? { days: 90 },
    backup: getPlatformSetting<{ schedules: string[] }>("backup") ?? {
      schedules: ["daily", "weekly", "monthly"],
    },
    qnap: getPlatformSetting<{ mode: string }>("qnap") ?? { mode: "mock" },
  });
});

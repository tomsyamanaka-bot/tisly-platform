import { Router } from "express";
import { getPlatformSetting, setPlatformSetting } from "../../db/database.js";

export const settingsRouter = Router();

const KEYS = ["pwa", "push", "discord", "email", "tv", "heartbeat"] as const;

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
  res.json({ ok: true, key, value: req.body });
});

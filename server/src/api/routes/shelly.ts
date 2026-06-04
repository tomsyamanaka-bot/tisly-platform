import { Router } from "express";
import {
  fetchShellyDeviceStatus,
  getShellyEnvMode,
  shellyReboot,
  shellyToggle,
} from "../../device/shelly-real-client.js";

export const shellyRouter = Router();

shellyRouter.get("/status", async (req, res) => {
  const baseUrl = req.query.baseUrl ? String(req.query.baseUrl) : undefined;
  const status = await fetchShellyDeviceStatus(baseUrl);
  res.json({ ...status, envMode: getShellyEnvMode() });
});

shellyRouter.post("/reboot", async (req, res) => {
  const body = req.body ?? {};
  const result = await shellyReboot({
    confirm: body.confirm === true,
    dryRun: body.dryRun === true,
    baseUrl: body.baseUrl ? String(body.baseUrl) : undefined,
  });
  const status = result.ok ? 200 : result.message.includes("confirm") ? 403 : 400;
  res.status(status).json(result);
});

shellyRouter.post("/toggle", async (req, res) => {
  const body = req.body ?? {};
  const result = await shellyToggle({
    confirm: body.confirm === true,
    dryRun: body.dryRun === true,
    on: body.on !== false,
    baseUrl: body.baseUrl ? String(body.baseUrl) : undefined,
  });
  const status = result.ok ? 200 : result.message.includes("confirm") ? 403 : 400;
  res.status(status).json(result);
});

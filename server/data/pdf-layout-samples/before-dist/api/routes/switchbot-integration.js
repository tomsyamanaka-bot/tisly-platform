import { Router } from "express";
import { requireAdminAuth } from "../../auth/auth-middleware.js";
import { config } from "../../config.js";
import { getSwitchBotDevices, getSwitchBotLockStatus, getSwitchBotMode, lockSwitchBot, unlockSwitchBot, } from "../../services/switchbotService.js";
export const switchbotIntegrationRouter = Router();
switchbotIntegrationRouter.get("/devices", async (_req, res) => {
    try {
        const result = await getSwitchBotDevices();
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: String(e), mode: getSwitchBotMode() });
    }
});
switchbotIntegrationRouter.get("/lock/status", async (req, res) => {
    try {
        const deviceId = req.query.deviceId ? String(req.query.deviceId) : undefined;
        const status = await getSwitchBotLockStatus(deviceId);
        res.json(status);
    }
    catch (e) {
        res.status(500).json({ error: String(e), mode: getSwitchBotMode() });
    }
});
switchbotIntegrationRouter.post("/lock/lock", requireAdminAuth, async (req, res) => {
    const body = req.body ?? {};
    const confirmed = body.confirmed === true;
    const deviceId = body.deviceId ? String(body.deviceId) : config.switchbot.lockDeviceId;
    const result = await lockSwitchBot(deviceId, confirmed);
    const status = result.ok ? 200 : result.message.includes("confirmed") ? 403 : 400;
    res.status(status).json(result);
});
switchbotIntegrationRouter.post("/lock/unlock", requireAdminAuth, async (req, res) => {
    const body = req.body ?? {};
    const confirmed = body.confirmed === true;
    const deviceId = body.deviceId ? String(body.deviceId) : config.switchbot.lockDeviceId;
    const result = await unlockSwitchBot(deviceId, confirmed);
    const status = result.ok ? 200 : result.message.includes("confirmed") ? 403 : 400;
    res.status(status).json(result);
});

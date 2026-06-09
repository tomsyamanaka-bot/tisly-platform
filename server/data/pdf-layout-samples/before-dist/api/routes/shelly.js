import { Router } from "express";
import { requireAdminAuth } from "../../auth/auth-middleware.js";
import { fetchShellyDeviceStatus, getShellyEnvMode, shellyReboot, shellyToggle, } from "../../device/shelly-real-client.js";
import { getShellyProvisioningStatus, registerShellyDevice, testShellyConnection, } from "../../deployment-kit/shelly-provisioning.js";
export const shellyRouter = Router();
shellyRouter.get("/status", async (req, res) => {
    const baseUrl = req.query.baseUrl ? String(req.query.baseUrl) : undefined;
    const status = await fetchShellyDeviceStatus(baseUrl);
    const prov = getShellyProvisioningStatus();
    res.json({ ...status, envMode: getShellyEnvMode(), provisioning: prov });
});
shellyRouter.post("/register", requireAdminAuth, async (req, res) => {
    const body = req.body ?? {};
    const customerCode = body.customerCode ? String(body.customerCode) : "";
    const siteId = body.siteId ? String(body.siteId) : "";
    const name = body.name ? String(body.name) : "";
    const location = body.location ? String(body.location) : "";
    if (!customerCode || !siteId || !name) {
        res.status(400).json({ error: "customerCode, siteId, name required" });
        return;
    }
    try {
        const result = await registerShellyDevice({
            customerCode,
            siteId,
            name,
            location: location || "電源盤",
            deviceId: body.deviceId ? String(body.deviceId) : undefined,
            baseUrl: body.baseUrl ? String(body.baseUrl) : undefined,
        });
        res.status(201).json(result);
    }
    catch (e) {
        res.status(400).json({ error: String(e) });
    }
});
shellyRouter.post("/test", async (req, res) => {
    const body = req.body ?? {};
    const result = await testShellyConnection({
        baseUrl: body.baseUrl ? String(body.baseUrl) : undefined,
        deviceId: body.deviceId ? String(body.deviceId) : undefined,
        customerCode: body.customerCode ? String(body.customerCode) : undefined,
    });
    res.json(result);
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

import { Router } from "express";
import { requireAdminAuth } from "../../auth/auth-middleware.js";
import { getDeploymentMqttStatus, sendTestHeartbeat, } from "../../deployment-kit/deployment-mqtt.js";
export const deploymentMqttRouter = Router();
deploymentMqttRouter.get("/status", (req, res) => {
    const customerCode = req.query.customerCode ? String(req.query.customerCode) : undefined;
    res.json(getDeploymentMqttStatus(customerCode));
});
deploymentMqttRouter.post("/test-heartbeat", requireAdminAuth, (req, res) => {
    const body = req.body ?? {};
    const deviceId = body.deviceId ? String(body.deviceId) : "";
    const customerCode = body.customerCode ? String(body.customerCode) : "";
    const siteId = body.siteId ? String(body.siteId) : undefined;
    if (!deviceId || !customerCode) {
        res.status(400).json({ error: "deviceId and customerCode required" });
        return;
    }
    try {
        const result = sendTestHeartbeat({ deviceId, customerCode, siteId });
        res.json(result);
    }
    catch (e) {
        res.status(404).json({ error: String(e) });
    }
});

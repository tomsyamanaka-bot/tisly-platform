import { Router } from "express";
import {
  buildQrSvg,
  getDeviceQr,
  provisionDevice,
} from "../../provisioning/device-provisioner.js";
import { listAuditLogs } from "../../provisioning/audit-log.js";

export const provisioningRouter = Router();

provisioningRouter.post("/devices", (req, res) => {
  const { siteId, zoneId, deviceType, platform, label, tenantId, actorId, actorLabel } =
    req.body;
  if (!siteId) {
    res.status(400).json({ error: "siteId required" });
    return;
  }
  try {
    const result = provisionDevice({
      siteId,
      zoneId,
      deviceType,
      platform,
      label,
      tenantId,
      actorId,
      actorLabel,
    });
    const qrSvg = buildQrSvg(result.qrPayload);
    res.status(201).json({
      ok: true,
      ...result,
      qrSvg,
      qrDataUrl: `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`,
      warning: "secret は初回レスポンスのみ。必ず安全に保管してください。",
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

provisioningRouter.get("/devices/:deviceId/qr", (req, res) => {
  try {
    res.json(getDeviceQr(req.params.deviceId));
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

provisioningRouter.get("/audit", (req, res) => {
  const tenantId = req.query.tenantId as string | undefined;
  const siteId = req.query.siteId as string | undefined;
  const limit = Number(req.query.limit ?? 100);
  res.json({ entries: listAuditLogs({ tenantId, siteId, limit }) });
});

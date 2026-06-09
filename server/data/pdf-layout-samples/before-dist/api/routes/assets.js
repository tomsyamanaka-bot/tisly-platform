import { Router } from "express";
import { requireAuth } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { ASSET_DEVICE_KINDS, createAssetQr, getAssetQrByToken, listAssetQrHistory, } from "../../assets/asset-qr.js";
export const assetsRouter = Router();
const assetAuth = [requireAuth("installer")];
function assertAssetRole(req, res) {
    const role = req.admin?.role ?? "viewer";
    if (!roleMeetsRequirement(role, "installer") && role !== "super_admin") {
        res.status(403).json({ error: "Installer or admin role required" });
        return false;
    }
    return true;
}
assetsRouter.post("/qr/create", ...assetAuth, (req, res) => {
    if (!assertAssetRole(req, res))
        return;
    const body = req.body;
    if (!body.customerCode || !body.deviceId || !body.deviceKind || !body.label) {
        res.status(400).json({
            error: "customerCode, deviceId, deviceKind, label required",
            allowedKinds: ASSET_DEVICE_KINDS,
        });
        return;
    }
    try {
        const record = createAssetQr({
            customerCode: body.customerCode,
            deviceId: body.deviceId,
            deviceKind: body.deviceKind,
            label: body.label,
            siteId: body.siteId,
            reissue: Boolean(body.reissue),
            actor: req.admin?.username,
        });
        res.status(body.reissue ? 200 : 201).json(record);
    }
    catch (e) {
        res.status(400).json({ error: String(e) });
    }
});
assetsRouter.get("/qr/history", ...assetAuth, (req, res) => {
    if (!assertAssetRole(req, res))
        return;
    const assetId = req.query.assetId;
    const customerCode = req.query.customerCode;
    const deviceId = req.query.deviceId;
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    res.json({
        history: listAssetQrHistory({ assetId, customerCode, deviceId, limit }),
    });
});
assetsRouter.get("/qr/:assetId", ...assetAuth, (req, res) => {
    if (!assertAssetRole(req, res))
        return;
    const record = getAssetQrByToken(String(req.params.assetId));
    if (!record) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    res.json(record);
});

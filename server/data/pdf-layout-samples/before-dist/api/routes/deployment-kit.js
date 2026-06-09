import { Router } from "express";
import { requireAdminAuth } from "../../auth/auth-middleware.js";
import { getCustomerByCode } from "../../customer/customer-store.js";
import { createCustomerWizard, generateNextCustomerCode, getCustomerContact, createSiteWizard, listDeploymentSiteTypes, listSitesForCustomerCode, provisionDeploymentDevice, listDeploymentDevices, getAssetDetail, buildAssetQr, listDeploymentAssets, recordInstallStep, getInstallationDashboard, getInstallRecords, createCustomerMaintenanceRequest, completeMaintenanceTicket, getCustomerMaintenanceSummary, listMaintenanceCases, buildCustomerPackageData, buildCustomerPackageHtml, buildCustomerPackagePdfBuffer, buildDeploymentChecklist, updateChecklistItem, markDeploymentComplete, buildDeploymentKpi, } from "../../deployment-kit/index.js";
export const deploymentKitRouter = Router();
deploymentKitRouter.get("/status", (_req, res) => {
    res.json({
        phase: "1001-1040",
        name: "First Customer Deployment Kit",
        routes: {
            customerWizard: "/customer/new",
            siteWizard: "/site/new",
            deviceProvision: "/device/provision",
            deploymentChecklist: "/deployment/checklist",
            assetDetail: "/asset/:assetId",
        },
        kpi: buildDeploymentKpi(),
    });
});
deploymentKitRouter.get("/kpi", (_req, res) => {
    res.json(buildDeploymentKpi());
});
/* Customer Wizard */
deploymentKitRouter.get("/customers/next-code", requireAdminAuth, (req, res) => {
    const prefix = req.query.prefix ?? "TOMS";
    res.json({ customerCode: generateNextCustomerCode(prefix) });
});
deploymentKitRouter.post("/customers/wizard", requireAdminAuth, (req, res) => {
    try {
        const body = req.body;
        if (!body.customerName || !body.siteName) {
            res.status(400).json({ error: "customerName and siteName required" });
            return;
        }
        const result = createCustomerWizard({
            customerName: body.customerName,
            siteName: body.siteName,
            address: body.address,
            contactName: body.contactName,
            phone: body.phone,
            email: body.email,
            codePrefix: body.codePrefix,
            plan: body.plan,
        });
        res.status(201).json(result);
    }
    catch (e) {
        res.status(400).json({ error: String(e) });
    }
});
deploymentKitRouter.get("/customers/:customerCode/contact", requireAdminAuth, (req, res) => {
    const customer = getCustomerByCode(String(req.params.customerCode));
    if (!customer) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    res.json({ contact: getCustomerContact(customer.customer_id) });
});
/* Site Wizard */
deploymentKitRouter.get("/sites/types", (_req, res) => {
    res.json({ siteTypes: listDeploymentSiteTypes() });
});
deploymentKitRouter.post("/sites/wizard", requireAdminAuth, (req, res) => {
    try {
        const body = req.body;
        if (!body.customerCode || !body.siteType) {
            res.status(400).json({ error: "customerCode and siteType required" });
            return;
        }
        const result = createSiteWizard({
            customerCode: body.customerCode,
            siteType: body.siteType,
            name: body.name,
            address: body.address,
        });
        res.status(201).json(result);
    }
    catch (e) {
        res.status(400).json({ error: String(e) });
    }
});
deploymentKitRouter.get("/sites/:customerCode", requireAdminAuth, (req, res) => {
    res.json({ sites: listSitesForCustomerCode(String(req.params.customerCode)) });
});
/* Device Provisioning */
deploymentKitRouter.post("/devices/provision", requireAdminAuth, (req, res) => {
    try {
        const body = req.body;
        if (!body.customerCode || !body.siteId || !body.name || !body.location || !body.kind) {
            res.status(400).json({ error: "customerCode, siteId, name, location, kind required" });
            return;
        }
        const result = provisionDeploymentDevice({
            customerCode: body.customerCode,
            siteId: body.siteId,
            deviceId: body.deviceId,
            name: body.name,
            location: body.location,
            kind: body.kind,
            zoneId: body.zoneId,
        });
        res.status(201).json(result);
    }
    catch (e) {
        res.status(400).json({ error: String(e) });
    }
});
deploymentKitRouter.get("/devices/:customerCode", requireAdminAuth, (req, res) => {
    res.json({ devices: listDeploymentDevices(String(req.params.customerCode)) });
});
/* QR Management */
deploymentKitRouter.get("/assets/customer/:customerCode", requireAdminAuth, (req, res) => {
    res.json({ assets: listDeploymentAssets(String(req.params.customerCode)) });
});
deploymentKitRouter.get("/assets/:assetId", (req, res) => {
    try {
        const detail = getAssetDetail(String(req.params.assetId));
        if (!detail) {
            res.status(404).json({ error: "Asset not found" });
            return;
        }
        res.json(detail);
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
deploymentKitRouter.get("/assets/:assetId/qr", (req, res) => {
    try {
        res.json(buildAssetQr(String(req.params.assetId)));
    }
    catch (e) {
        res.status(404).json({ error: String(e) });
    }
});
/* Installation Mode */
deploymentKitRouter.post("/install/step", requireAdminAuth, (req, res) => {
    try {
        const body = req.body;
        if (!body.customerCode || !body.step) {
            res.status(400).json({ error: "customerCode and step required" });
            return;
        }
        const result = recordInstallStep({
            customerCode: body.customerCode,
            siteId: body.siteId,
            deviceId: body.deviceId,
            step: body.step,
            photoPath: body.photoPath,
            signatureData: body.signatureData,
            gpsLat: body.gpsLat,
            gpsLng: body.gpsLng,
            notes: body.notes,
        });
        res.status(201).json(result);
    }
    catch (e) {
        res.status(400).json({ error: String(e) });
    }
});
deploymentKitRouter.get("/install/:customerCode/dashboard", requireAdminAuth, (req, res) => {
    const dash = getInstallationDashboard(String(req.params.customerCode));
    if (!dash) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    res.json(dash);
});
deploymentKitRouter.get("/install/:customerCode/records", requireAdminAuth, (req, res) => {
    const deviceId = req.query.deviceId;
    res.json({ records: getInstallRecords(String(req.params.customerCode), deviceId) });
});
/* Maintenance */
deploymentKitRouter.get("/maintenance/:customerCode", requireAdminAuth, (req, res) => {
    const summary = getCustomerMaintenanceSummary(String(req.params.customerCode));
    if (!summary) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    res.json(summary);
});
deploymentKitRouter.post("/maintenance/request", requireAdminAuth, (req, res) => {
    try {
        const body = req.body;
        if (!body.customerCode) {
            res.status(400).json({ error: "customerCode required" });
            return;
        }
        const result = createCustomerMaintenanceRequest(body);
        res.status(201).json(result);
    }
    catch (e) {
        res.status(400).json({ error: String(e) });
    }
});
deploymentKitRouter.post("/maintenance/:caseId/complete", requireAdminAuth, (req, res) => {
    const notes = req.body.notes;
    const result = completeMaintenanceTicket(String(req.params.caseId), notes);
    if (!result) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    res.json(result);
});
deploymentKitRouter.get("/maintenance/cases/all", requireAdminAuth, (_req, res) => {
    res.json({ cases: listMaintenanceCases() });
});
/* Customer Package */
deploymentKitRouter.get("/package/:customerCode", requireAdminAuth, (req, res) => {
    const data = buildCustomerPackageData(String(req.params.customerCode));
    if (!data) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    res.json(data);
});
deploymentKitRouter.get("/package/:customerCode/html", requireAdminAuth, (req, res) => {
    const html = buildCustomerPackageHtml(String(req.params.customerCode));
    if (html.includes("Customer not found")) {
        res.status(404).send(html);
        return;
    }
    res.type("html").send(html);
});
deploymentKitRouter.get("/package/:customerCode/pdf", requireAdminAuth, (req, res) => {
    const data = buildCustomerPackageData(String(req.params.customerCode));
    if (!data) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    const buf = buildCustomerPackagePdfBuffer(String(req.params.customerCode));
    res
        .type("application/pdf")
        .setHeader("Content-Disposition", `attachment; filename="TiSLY-${data.customerCode}-handover.pdf"`)
        .send(buf);
});
/* Deployment Checklist */
deploymentKitRouter.get("/checklist", async (req, res) => {
    const customerCode = req.query.customerCode;
    const checklist = await buildDeploymentChecklist(customerCode);
    res.json(checklist);
});
deploymentKitRouter.put("/checklist/:customerCode/:itemId", requireAdminAuth, (req, res) => {
    try {
        const ok = Boolean(req.body.ok);
        const result = updateChecklistItem(String(req.params.customerCode), String(req.params.itemId), ok);
        res.json(result);
    }
    catch (e) {
        res.status(400).json({ error: String(e) });
    }
});
deploymentKitRouter.post("/checklist/:customerCode/complete", requireAdminAuth, async (req, res) => {
    const done = await markDeploymentComplete(String(req.params.customerCode));
    if (!done) {
        res.status(400).json({ error: "All checklist items must be OK before deployment complete" });
        return;
    }
    res.json({ deploymentComplete: true });
});

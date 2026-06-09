import { Router } from "express";
import { requireAdminAuth } from "../../auth/auth-middleware.js";
import { createCustomerOnboarding } from "../../deployment-kit/customer-onboarding.js";
export const customerOnboardingRouter = Router();
customerOnboardingRouter.post("/create", requireAdminAuth, (req, res) => {
    const body = req.body ?? {};
    try {
        const result = createCustomerOnboarding({
            customerName: String(body.customerName ?? ""),
            customerCode: body.customerCode ? String(body.customerCode) : undefined,
            siteName: String(body.siteName ?? ""),
            plan: body.plan,
            address: body.address ? String(body.address) : undefined,
            siteType: body.siteType,
            devices: Array.isArray(body.devices) ? body.devices : [],
        });
        res.status(201).json(result);
    }
    catch (e) {
        res.status(400).json({ error: String(e) });
    }
});

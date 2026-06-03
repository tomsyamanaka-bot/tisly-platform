import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { requireTenantMatch } from "../../auth/tenant-guard.js";
import { canAccessCustomer } from "../../auth/customer-auth.js";
import { getCustomerByCode } from "../../customer/customer-store.js";
import { requirePlanFeature } from "../../customer/plan-guard.js";
import {
  listProFloorLayers,
  placeProMapPin,
  deleteProMapPin,
  findAlertFloorTier,
  PRO_PIN_TYPES,
} from "../../pro-remote/floor-map-stack.js";

export const proRemoteFloorMapRouter = Router();

const proAuth = [requireAuth("viewer"), requireTenantMatch("customerCode")] as const;

function resolveCustomer(req: AuthedRequest, code: string) {
  const customer = getCustomerByCode(code);
  if (!customer) return null;
  if (req.admin && !canAccessCustomer(req.admin, customer.customer_id)) return null;
  return customer;
}

proRemoteFloorMapRouter.get("/:customerCode/pro-remote/floor-stack", ...proAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found" });
    return;
  }
  if (!requirePlanFeature(customer.plan, "customer_portal", res)) return;
  const layers = listProFloorLayers(customer.customer_code);
  const alert = findAlertFloorTier(customer.customer_code);
  res.json({ layers, alert, pinTypes: PRO_PIN_TYPES });
});

proRemoteFloorMapRouter.post(
  "/:customerCode/pro-remote/floor-stack/pins",
  ...proAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    if (!requirePlanFeature(customer.plan, "customer_portal", res)) return;
    const body = req.body as {
      layerId?: string;
      pinType?: string;
      posX?: number;
      posY?: number;
      label?: string;
      deviceId?: string;
    };
    if (!body.layerId || body.posX == null || body.posY == null) {
      res.status(400).json({ error: "layerId, posX, posY required" });
      return;
    }
    try {
      const pin = placeProMapPin({
        layerId: body.layerId,
        pinType: body.pinType ?? "esp",
        posX: body.posX,
        posY: body.posY,
        label: body.label,
        deviceId: body.deviceId,
      });
      res.status(201).json(pin);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

proRemoteFloorMapRouter.delete(
  "/:customerCode/pro-remote/floor-stack/pins/:pinId",
  ...proAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    if (!deleteProMapPin(String(req.params.pinId))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  }
);

proRemoteFloorMapRouter.get(
  "/:customerCode/pro-remote/floor-stack/alert-jump",
  ...proAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    res.json(findAlertFloorTier(customer.customer_code));
  }
);

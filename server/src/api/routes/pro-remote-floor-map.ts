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
  moveProMapPin,
  updateProFloorLayerDisplayName,
  findAlertFloorTier,
  PRO_PIN_TYPES,
  PRO_FLOOR_TIERS,
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
  res.json({ layers, alert, pinTypes: PRO_PIN_TYPES, tiers: PRO_FLOOR_TIERS });
});

proRemoteFloorMapRouter.patch(
  "/:customerCode/pro-remote/floor-stack/layers/:layerId",
  ...proAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const displayName = (req.body as { displayName?: string }).displayName;
    if (!displayName?.trim()) {
      res.status(400).json({ error: "displayName required" });
      return;
    }
    if (!updateProFloorLayerDisplayName(String(req.params.layerId), displayName)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true, displayName: displayName.trim() });
  }
);

proRemoteFloorMapRouter.patch(
  "/:customerCode/pro-remote/floor-stack/pins/:pinId",
  ...proAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(req.admin ? 403 : 404).json({ error: "Not found" });
      return;
    }
    const body = req.body as { posX?: number; posY?: number };
    if (body.posX == null || body.posY == null) {
      res.status(400).json({ error: "posX, posY required" });
      return;
    }
    const pin = moveProMapPin(String(req.params.pinId), body.posX, body.posY);
    if (!pin) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(pin);
  }
);

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

import { Router } from "express";
import QRCode from "qrcode";
import {
  requireAuth,
  type AuthedRequest,
} from "../../auth/auth-middleware.js";
import {
  bindDeviceToPropertyV1,
  DeviceBindingConflictError,
  listDeviceIdsForLabelsV1,
  listPropertyDeviceStateV1,
  normalizeDeviceIdV1,
} from "../../device/property-device-binding-v1.js";

export const deviceBindingV1Router = Router();

function resolveCustomerCode(
  req: AuthedRequest,
  supplied?: unknown
): string {
  const sessionCode = req.admin?.customerCode?.trim().toUpperCase();
  const requested = String(supplied ?? "").trim().toUpperCase();
  if (sessionCode && requested && sessionCode !== requested) {
    throw new Error("customer access denied");
  }
  return sessionCode || requested || "TOMS001";
}

deviceBindingV1Router.get(
  "/properties",
  requireAuth("installer"),
  (req: AuthedRequest, res) => {
    try {
      const customerCode = resolveCustomerCode(
        req,
        req.query.customerCode
      );
      res.json({
        ok: true,
        customerCode,
        properties: listPropertyDeviceStateV1(customerCode),
        deviceIds: listDeviceIdsForLabelsV1(customerCode),
      });
    } catch (error) {
      res.status(403).json({ error: String((error as Error).message) });
    }
  }
);

deviceBindingV1Router.post(
  "/bind",
  requireAuth("installer"),
  (req: AuthedRequest, res) => {
    const body = req.body as {
      customerCode?: unknown;
      property_id?: unknown;
      propertyId?: unknown;
      device_id?: unknown;
      deviceId?: unknown;
      qrText?: unknown;
    };
    try {
      const customerCode = resolveCustomerCode(
        req,
        body.customerCode
      );
      const propertyId = String(
        body.property_id ?? body.propertyId ?? ""
      ).trim();
      const binding = bindDeviceToPropertyV1({
        customerCode,
        propertyId,
        deviceId:
          body.device_id ?? body.deviceId ?? body.qrText,
        boundBy: req.admin?.username,
      });
      res.status(201).json({
        ok: true,
        binding,
        property: listPropertyDeviceStateV1(customerCode).find(
          (item) => item.propertyId === propertyId
        ),
      });
    } catch (error) {
      if (error instanceof DeviceBindingConflictError) {
        res.status(409).json({
          error: "この機器は別の物件に登録済みです",
          currentPropertyId: error.currentPropertyId,
        });
        return;
      }
      const message = String((error as Error).message);
      const status = message.includes("access denied")
        ? 403
        : message.includes("not found")
          ? 404
          : 400;
      res.status(status).json({ error: message });
    }
  }
);

deviceBindingV1Router.post(
  "/qr",
  requireAuth("installer"),
  async (req: AuthedRequest, res) => {
    try {
      resolveCustomerCode(req, req.body?.customerCode);
      const deviceId = normalizeDeviceIdV1(
        req.body?.device_id ?? req.body?.deviceId
      );
      const qrDataUrl = await QRCode.toDataURL(deviceId, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 512,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });
      res.json({
        ok: true,
        deviceId,
        deviceType: "RP2350",
        qrPayload: deviceId,
        qrDataUrl,
      });
    } catch (error) {
      const message = String((error as Error).message);
      res.status(
        message.includes("access denied") ? 403 : 400
      ).json({ error: message });
    }
  }
);

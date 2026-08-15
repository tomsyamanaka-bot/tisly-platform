import {
  Router,
  type NextFunction,
  type Response,
} from "express";
import { config } from "../../config.js";
import {
  optionalAdminAuth,
  type AuthedRequest,
} from "../../auth/auth-middleware.js";
import { recordMeterIncrementV1 } from "../../device/device-port-config-v1.js";

export const meterTelemetryRouter = Router();

const METER_OPERATOR_ROLES = new Set([
  "surveyor",
  "installer",
  "maintenance",
  "manager",
  "owner",
  "admin",
  "super_admin",
]);

/**
 * 実機トークンまたは社内ログインだけに、
 * パルス加算APIの書込みを許可する。
 */
function authorizeMeterWrite(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  const deviceToken =
    req.header("X-Remote-Test-Token")?.trim() ||
    req.header("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  const hasDeviceToken = Boolean(
    config.remoteTest.token &&
      deviceToken === config.remoteTest.token
  );
  const hasOperatorSession = Boolean(
    req.admin && METER_OPERATOR_ROLES.has(req.admin.role)
  );
  if (!hasDeviceToken && !hasOperatorSession) {
    res.status(403).json({ error: "Meter telemetry authorization required" });
    return;
  }
  next();
}

function receiveMeterTelemetry(req: AuthedRequest, res: Response): void {
  try {
    const result = recordMeterIncrementV1({
      deviceId: req.body?.device_id ?? req.body?.deviceId,
      port: req.body?.port,
      pulseIncrement:
        req.body?.pulse_increment ?? req.body?.pulseIncrement,
      rawState: req.body?.raw_state ?? req.body?.rawState,
    });
    res.json({
      ok: true,
      device_id: result.deviceId,
      port: result.port,
      pulse_increment: result.pulseIncrement,
      pulse_count: result.pulseCount,
      meter_value: result.meterValue,
      raw_state: result.rawState === "on" ? 1 : 0,
      last_seen: result.lastSeen,
      status: result.emergencyStatus,
    });
  } catch (error) {
    res.status(400).json({
      error: String((error as Error).message),
    });
  }
}

meterTelemetryRouter.post(
  ["/telemetry", "/update"],
  optionalAdminAuth,
  authorizeMeterWrite,
  receiveMeterTelemetry
);

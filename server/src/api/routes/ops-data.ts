import { Router } from "express";
import { opsCustomerScopeMiddleware } from "../../ops/ops-customer-scope.js";
import {
  buildOpsAlarms,
  buildOpsDevices,
  buildOpsMap,
  buildOpsQnap,
  buildOpsTv,
} from "../../ops/map-builder.js";
import type { AuthedRequest } from "../../auth/auth-middleware.js";

export const opsDataRouter = Router();

function requireCustomerScope(req: AuthedRequest, res: import("express").Response): string | null {
  const code = req.opsScope?.customerCode;
  if (!code || code === "ALL") {
    res.status(400).json({
      error: "customerCode required",
      hint: "Pass ?customerCode=TOMS001 (ALL is not allowed for map data)",
    });
    return null;
  }
  return code;
}

opsDataRouter.get("/map", opsCustomerScopeMiddleware, (req: AuthedRequest, res) => {
  const code = requireCustomerScope(req, res);
  if (!code) return;
  const data = buildOpsMap(code);
  if (!data) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(data);
});

opsDataRouter.get("/alarms", opsCustomerScopeMiddleware, (req: AuthedRequest, res) => {
  const code = requireCustomerScope(req, res);
  if (!code) return;
  const data = buildOpsAlarms(code, Number(req.query.limit ?? 50));
  if (!data) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(data);
});

opsDataRouter.get("/devices", opsCustomerScopeMiddleware, (req: AuthedRequest, res) => {
  const code = requireCustomerScope(req, res);
  if (!code) return;
  const data = buildOpsDevices(code);
  if (!data) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(data);
});

opsDataRouter.get("/tv", opsCustomerScopeMiddleware, (req: AuthedRequest, res) => {
  const code = requireCustomerScope(req, res);
  if (!code) return;
  const data = buildOpsTv(code);
  if (!data) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(data);
});

opsDataRouter.get("/qnap", opsCustomerScopeMiddleware, (req: AuthedRequest, res) => {
  const code = requireCustomerScope(req, res);
  if (!code) return;
  const data = buildOpsQnap(code);
  if (!data) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(data);
});

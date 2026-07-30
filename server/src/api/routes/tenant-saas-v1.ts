/**
 * 組織 SaaS ステータス API
 * GET/PATCH /api/tenant-saas/v1
 */
import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { canChangeCustomerSettings } from "../../auth/roles.js";
import { getCustomerByCode, getCustomerById } from "../../customer/customer-store.js";
import {
  getTenantSaasStatusForCustomerIdV1,
  listDevicesSaasForCustomerV1,
  seedDemoTenantSaasV1,
  updateCustomerSaasV1,
} from "../../tenant/tenant-saas-store-v1.js";
import {
  normalizeCountryCodeV1,
  normalizeCurrencyV1,
  normalizeMonthlyFeeV1,
  normalizePlanStatusV1,
} from "../../tenant/tenant-saas-v1.js";

export const tenantSaasV1Router = Router();

const adminAuth = [requireAuth("admin")] as const;

function assertAdminRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!canChangeCustomerSettings(role) && role !== "super_admin") {
    res.status(403).json({ error: "管理者権限が必要です" });
    return false;
  }
  return true;
}

function resolveCustomerId(req: AuthedRequest): string | null {
  if (req.admin?.customerId) return req.admin.customerId;
  if (req.admin?.customerCode) {
    return getCustomerByCode(req.admin.customerCode)?.customer_id ?? null;
  }
  return null;
}

tenantSaasV1Router.get("/", ...adminAuth, (req: AuthedRequest, res) => {
  if (!assertAdminRole(req, res)) return;

  // デモ既定値を安全に追記（削除なし）
  seedDemoTenantSaasV1();

  const customerId = resolveCustomerId(req);
  if (!customerId) {
    res.status(400).json({ error: "顧客コンテキストが必要です" });
    return;
  }

  const status = getTenantSaasStatusForCustomerIdV1(customerId);
  if (!status) {
    res.status(404).json({ error: "顧客が見つかりません" });
    return;
  }

  const devices = listDevicesSaasForCustomerV1(customerId).map((d) => ({
    deviceId: d.device_id,
    label: d.label,
    tenant_id: d.tenant_id,
    country_code: d.country_code,
    currency: d.currency,
    plan_status: d.plan_status,
    monthly_fee: d.monthly_fee,
  }));

  res.json({
    ok: true,
    status,
    devices,
  });
});

tenantSaasV1Router.patch("/", ...adminAuth, (req: AuthedRequest, res) => {
  if (!assertAdminRole(req, res)) return;

  const customerId = resolveCustomerId(req);
  if (!customerId) {
    res.status(400).json({ error: "顧客コンテキストが必要です" });
    return;
  }

  if (!getCustomerById(customerId)) {
    res.status(404).json({ error: "顧客が見つかりません" });
    return;
  }

  const body = req.body ?? {};
  const patch: Parameters<typeof updateCustomerSaasV1>[1] = {};

  if (body.country_code !== undefined) {
    patch.country_code = normalizeCountryCodeV1(body.country_code);
  }
  if (body.currency !== undefined) {
    patch.currency = normalizeCurrencyV1(
      body.currency,
      patch.country_code
    );
  }
  if (body.plan_status !== undefined) {
    patch.plan_status = normalizePlanStatusV1(body.plan_status);
  }
  if (body.monthly_fee !== undefined) {
    patch.monthly_fee = normalizeMonthlyFeeV1(body.monthly_fee);
  }
  if (typeof body.tenant_id === "string" && body.tenant_id.trim()) {
    patch.tenant_id = body.tenant_id.trim();
  }

  const status = updateCustomerSaasV1(customerId, patch);
  if (!status) {
    res.status(404).json({ error: "更新に失敗しました" });
    return;
  }

  res.json({ ok: true, status });
});

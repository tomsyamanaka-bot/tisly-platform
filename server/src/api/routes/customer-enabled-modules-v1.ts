/**
 * 顧客別モジュール出し分け API
 * GET/PATCH /api/customer-modules/v1
 */
import { Router, type Response } from "express";
import {
  requireAuth,
  type AuthedRequest,
} from "../../auth/auth-middleware.js";
import { canChangeCustomerSettings } from "../../auth/roles.js";
import { getCustomerByCode } from "../../customer/customer-store.js";
import {
  isInternalOpsCustomerV1,
  normalizeModuleIdListV1,
} from "../../tenant/customer-enabled-modules-v1.js";
import {
  buildEnabledModulesViewV1,
  upsertEnabledModulesV1,
} from "../../tenant/customer-enabled-modules-store-v1.js";

export const customerEnabledModulesV1Router = Router();

function assertAdminRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!canChangeCustomerSettings(role) && role !== "super_admin") {
    res.status(403).json({ error: "管理者権限が必要です" });
    return false;
  }
  return true;
}

function resolveTargetCode(req: AuthedRequest): string {
  const q = String(req.query.customerCode || "").trim().toUpperCase();
  if (q) return q;
  const bodyCode =
    req.body && typeof req.body === "object"
      ? String(
          (req.body as { customerCode?: string }).customerCode || ""
        )
          .trim()
          .toUpperCase()
      : "";
  if (bodyCode) return bodyCode;
  return String(req.admin?.customerCode || "TOMS001").toUpperCase();
}

/** 自テナント以外は社内（TOMS001）管理者のみ変更可 */
function assertScope(
  req: AuthedRequest,
  res: Response,
  targetCode: string
): boolean {
  const self = String(req.admin?.customerCode || "").toUpperCase();
  if (self === targetCode) return true;
  if (isInternalOpsCustomerV1(self)) return true;
  res.status(403).json({
    error: "他顧客のモジュール設定は社内管理者のみ変更できます",
  });
  return false;
}

customerEnabledModulesV1Router.get(
  "/",
  requireAuth("viewer"),
  (req: AuthedRequest, res) => {
    const code = resolveTargetCode(req);
    if (!assertScope(req, res, code)) return;
    // 存在しないコードでも既定プリセットを返す（モック対応）
    const view = buildEnabledModulesViewV1(code);
    res.json({
      ok: true,
      ...view,
      customerExists: Boolean(getCustomerByCode(code)),
    });
  }
);

customerEnabledModulesV1Router.patch(
  "/",
  requireAuth("admin"),
  (req: AuthedRequest, res) => {
    if (!assertAdminRole(req, res)) return;
    const code = resolveTargetCode(req);
    if (!assertScope(req, res, code)) return;

    const body = (req.body || {}) as {
      enabledModules?: unknown;
      modules?: unknown;
    };
    const modules = normalizeModuleIdListV1(
      body.enabledModules ?? body.modules
    );
    if (!modules.length) {
      res.status(400).json({
        error: "enabledModules 配列が必要です",
      });
      return;
    }

    const saved = upsertEnabledModulesV1({
      customerCode: code,
      enabledModules: modules,
      updatedBy: req.admin?.username ?? null,
    });

    res.json({
      ok: true,
      ...buildEnabledModulesViewV1(code),
      saved,
    });
  }
);

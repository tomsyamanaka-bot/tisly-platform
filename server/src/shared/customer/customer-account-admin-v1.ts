/**
 * 社内用 顧客アカウント管理 v1
 *
 * /app Customer Master から
 * 顧客・ログイン・モジュール・デバイスを操作。
 */

import { v4 as uuid } from "uuid";
import { hashPassword } from "../../auth/password.js";
import { listCustomerUsers } from "../../customer/customer-invite.js";
import {
  getCustomerByCode,
  listCustomers,
  upsertCustomer,
  ensureDemoSite,
  listDevicesForCustomer,
} from "../../customer/customer-store.js";
import type { CustomerPlan } from "../../customer/types.js";
import { getDatabase } from "../../db/database.js";
import {
  MODULE_CATALOG_V1,
  normalizeModuleIdListV1,
} from "../../tenant/customer-enabled-modules-v1.js";
import {
  getEnabledModulesForCustomerV1,
  upsertEnabledModulesV1,
} from "../../tenant/customer-enabled-modules-store-v1.js";
import {
  getCustomerMasterV1,
  upsertCustomerMasterV1,
  normalizeCustomerPortalPlanV1,
} from "./customer-master-v1.js";
import {
  getCustomerTenantBindingsV1,
  upsertCustomerTenantBindingsV1,
} from "./customer-tenant-bindings-v1.js";
import { resolveCustomerTenantProfileV1 } from "./customer-tenant-profile-v1.js";

export interface CustomerAccountUserV1 {
  id: string;
  username: string;
  role: string;
  status: string;
}

export interface CustomerAccountRowV1 {
  customerId: string;
  customerCode: string;
  customerName: string;
  plan: string;
  status: string;
  enabledModules: string[];
  users: CustomerAccountUserV1[];
  bindings: ReturnType<typeof getCustomerTenantBindingsV1>;
  tenantProfile: ReturnType<typeof resolveCustomerTenantProfileV1>;
  deviceCount: number;
}

export function listCustomerAccountsAdminV1(opts?: {
  customerCode?: string;
}): CustomerAccountRowV1[] {
  const filter = String(opts?.customerCode ?? "")
    .trim()
    .toUpperCase();
  const customers = listCustomers(true).filter((c) => {
    if (!filter) return true;
    return c.customer_code.toUpperCase().includes(filter);
  });
  return customers.map((c) => {
    const code = c.customer_code.toUpperCase();
    const users = listCustomerUsers(c.customer_id).map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      status: u.status,
    }));
    return {
      customerId: c.customer_id,
      customerCode: code,
      customerName: c.customer_name,
      plan: c.plan,
      status: c.status,
      enabledModules: getEnabledModulesForCustomerV1(code),
      users,
      bindings: getCustomerTenantBindingsV1(code),
      tenantProfile: resolveCustomerTenantProfileV1(code),
      deviceCount: listDevicesForCustomer(c.customer_id).length,
    };
  });
}

export function createCustomerAccountAdminV1(input: {
  customerCode: string;
  customerName: string;
  username: string;
  password: string;
  plan?: CustomerPlan;
  enabledModules?: string[];
  bindings?: Partial<ReturnType<typeof getCustomerTenantBindingsV1>>;
  actorLabel?: string;
}): CustomerAccountRowV1 {
  const code = String(input.customerCode || "").trim().toUpperCase();
  const username = String(input.username || "").trim().toLowerCase();
  const password = String(input.password || "");
  if (!/^[A-Z0-9]{3,16}$/.test(code)) {
    throw new Error("顧客コードは英数字3〜16文字です");
  }
  if (!username || username.length < 3) {
    throw new Error("ログインIDを入力してください");
  }
  if (password.length < 8) {
    throw new Error("パスワードは8文字以上です");
  }
  if (getCustomerByCode(code)) {
    throw new Error(`顧客コード ${code} は既に登録されています`);
  }

  const customerId = `cust-${code.toLowerCase()}`;
  const siteId = `site-${code.toLowerCase()}-main`;
  upsertCustomer({
    customerId,
    customerCode: code,
    customerName: input.customerName,
    plan: input.plan ?? "PRO",
    tenantId: customerId,
    branding: {
      companyColor: "#1e3a8a",
      companyName: input.customerName,
      logoUrl: `/assets/customers/${code.toLowerCase()}-logo.svg`,
    },
  });
  ensureDemoSite(customerId, siteId, input.customerName, "");

  const hash = hashPassword(password);
  const userId = `cu-${code}-owner`;
  getDatabase()
    .prepare(
      `INSERT INTO customer_users (id, customer_id, username, password_hash, role, status)
       VALUES (?, ?, ?, ?, 'owner', 'active')
       ON CONFLICT(customer_id, username) DO UPDATE SET
         password_hash = excluded.password_hash,
         status = 'active'`
    )
    .run(userId, customerId, username, hash);

  const modules = normalizeModuleIdListV1(
    input.enabledModules ?? [
      "tisly_home_v1",
      "security_floor_v1",
      "customer_portal",
    ]
  );
  upsertEnabledModulesV1({
    customerCode: code,
    enabledModules: modules,
    updatedBy: input.actorLabel ?? "customer-master-v1",
  });

  upsertCustomerMasterV1({
    customerCode: code,
    customerName: input.customerName,
    address: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    plan: normalizeCustomerPortalPlanV1(input.plan ?? "PRO"),
    status: "active",
    businessCustomerId: customerId,
  });

  if (input.bindings) {
    upsertCustomerTenantBindingsV1({
      customerCode: code,
      ...input.bindings,
    });
  }

  const row = listCustomerAccountsAdminV1({ customerCode: code })[0];
  if (!row) throw new Error("作成後の読込に失敗しました");
  return row;
}

export function updateCustomerAccountAdminV1(input: {
  customerCode: string;
  customerName?: string;
  plan?: CustomerPlan;
  enabledModules?: string[];
  bindings?: Partial<ReturnType<typeof getCustomerTenantBindingsV1>>;
  actorLabel?: string;
}): CustomerAccountRowV1 {
  const code = String(input.customerCode || "").trim().toUpperCase();
  const customer = getCustomerByCode(code);
  if (!customer) throw new Error("顧客が見つかりません");

  if (input.customerName || input.plan) {
    upsertCustomer({
      customerId: customer.customer_id,
      customerCode: code,
      customerName: input.customerName ?? customer.customer_name,
      plan: (input.plan ?? customer.plan) as CustomerPlan,
      tenantId: customer.tenant_id ?? customer.customer_id,
    });
    const master = getCustomerMasterV1(code);
    if (master) {
      upsertCustomerMasterV1({
        ...master,
        customerName: input.customerName ?? master.customerName,
        plan: input.plan
          ? normalizeCustomerPortalPlanV1(String(input.plan))
          : master.plan,
      });
    }
  }

  if (input.enabledModules?.length) {
    upsertEnabledModulesV1({
      customerCode: code,
      enabledModules: normalizeModuleIdListV1(input.enabledModules),
      updatedBy: input.actorLabel ?? "customer-master-v1",
    });
  }

  if (input.bindings) {
    upsertCustomerTenantBindingsV1({
      customerCode: code,
      ...input.bindings,
    });
  }

  const row = listCustomerAccountsAdminV1({ customerCode: code })[0];
  if (!row) throw new Error("更新後の読込に失敗しました");
  return row;
}

export function resetCustomerUserPasswordAdminV1(input: {
  customerCode: string;
  username: string;
  password: string;
}): { ok: true; username: string } {
  const code = String(input.customerCode || "").trim().toUpperCase();
  const username = String(input.username || "").trim().toLowerCase();
  const password = String(input.password || "");
  if (password.length < 8) {
    throw new Error("パスワードは8文字以上です");
  }
  const customer = getCustomerByCode(code);
  if (!customer) throw new Error("顧客が見つかりません");

  const row = getDatabase()
    .prepare(
      `SELECT id FROM customer_users
       WHERE customer_id = ? AND username = ? COLLATE NOCASE`
    )
    .get(customer.customer_id, username) as { id: string } | undefined;
  if (!row) throw new Error("ユーザーが見つかりません");

  const hash = hashPassword(password);
  getDatabase()
    .prepare(
      `UPDATE customer_users SET password_hash = ?, status = 'active',
       failed_login_count = 0, locked_until = NULL
       WHERE id = ?`
    )
    .run(hash, row.id);

  return { ok: true, username };
}

export function addCustomerUserAdminV1(input: {
  customerCode: string;
  username: string;
  password: string;
  role?: string;
}): CustomerAccountUserV1 {
  const code = String(input.customerCode || "").trim().toUpperCase();
  const username = String(input.username || "").trim().toLowerCase();
  const password = String(input.password || "");
  const role = String(input.role || "viewer");
  if (password.length < 8) throw new Error("パスワードは8文字以上です");
  const customer = getCustomerByCode(code);
  if (!customer) throw new Error("顧客が見つかりません");

  const id = `cu-${code}-${uuid().slice(0, 8)}`;
  const hash = hashPassword(password);
  getDatabase()
    .prepare(
      `INSERT INTO customer_users (id, customer_id, username, password_hash, role, status)
       VALUES (?, ?, ?, ?, ?, 'active')
       ON CONFLICT(customer_id, username) DO UPDATE SET
         password_hash = excluded.password_hash,
         role = excluded.role,
         status = 'active'`
    )
    .run(id, customer.customer_id, username, hash, role);

  return { id, username, role, status: "active" };
}

export function listModuleCatalogAdminV1() {
  return MODULE_CATALOG_V1.filter((m) =>
    ["iot", "portal"].includes(m.category)
  );
}

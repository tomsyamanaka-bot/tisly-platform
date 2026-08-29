/**
 * 顧客別 enabledModules の永続化。
 * 既存顧客行は変更せず、専用テーブルへ追記する。
 */
import { getDatabase } from "../db/database.js";
import {
  MODULE_CATALOG_V1,
  normalizeModuleIdListV1,
  resolveDefaultEnabledModulesV1,
  type ModuleCatalogEntryV1,
} from "./customer-enabled-modules-v1.js";

export interface CustomerEnabledModulesRowV1 {
  customerCode: string;
  enabledModules: string[];
  updatedAt: string;
  updatedBy: string | null;
}

export function ensureCustomerEnabledModulesTableV1(): void {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS customer_enabled_modules_v1 (
      customer_code TEXT PRIMARY KEY,
      enabled_modules_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );
  `);
}

function parseModulesJson(raw: string): string[] {
  try {
    return normalizeModuleIdListV1(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function getStoredEnabledModulesV1(
  customerCode: string
): CustomerEnabledModulesRowV1 | null {
  ensureCustomerEnabledModulesTableV1();
  const code = String(customerCode || "").toUpperCase();
  if (!code) return null;
  const row = getDatabase()
    .prepare(
      `SELECT customer_code, enabled_modules_json, updated_at, updated_by
       FROM customer_enabled_modules_v1
       WHERE customer_code = ? COLLATE NOCASE`
    )
    .get(code) as
    | {
        customer_code: string;
        enabled_modules_json: string;
        updated_at: string;
        updated_by: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    customerCode: row.customer_code,
    enabledModules: parseModulesJson(row.enabled_modules_json),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** 保存済みがあればそれ、なければ顧客コード別既定 */
export function getEnabledModulesForCustomerV1(
  customerCode: string
): string[] {
  const stored = getStoredEnabledModulesV1(customerCode);
  if (stored?.enabledModules?.length) {
    return stored.enabledModules;
  }
  return resolveDefaultEnabledModulesV1(customerCode);
}

export function upsertEnabledModulesV1(input: {
  customerCode: string;
  enabledModules: string[];
  updatedBy?: string | null;
}): CustomerEnabledModulesRowV1 {
  ensureCustomerEnabledModulesTableV1();
  const code = String(input.customerCode || "").toUpperCase();
  const modules = normalizeModuleIdListV1(input.enabledModules);
  if (!code) {
    throw new Error("customerCode is required");
  }
  if (!modules.length) {
    throw new Error("enabledModules must not be empty");
  }
  const now = new Date().toISOString();
  const updatedBy = input.updatedBy ?? null;
  getDatabase()
    .prepare(
      `INSERT INTO customer_enabled_modules_v1
         (customer_code, enabled_modules_json, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(customer_code) DO UPDATE SET
         enabled_modules_json = excluded.enabled_modules_json,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`
    )
    .run(code, JSON.stringify(modules), now, updatedBy);
  return {
    customerCode: code,
    enabledModules: modules,
    updatedAt: now,
    updatedBy,
  };
}

export function listModuleCatalogV1(): ModuleCatalogEntryV1[] {
  return [...MODULE_CATALOG_V1];
}

export function buildEnabledModulesViewV1(customerCode: string): {
  customerCode: string;
  enabledModules: string[];
  catalog: ModuleCatalogEntryV1[];
  source: "stored" | "default";
  updatedAt: string | null;
  updatedBy: string | null;
} {
  const code = String(customerCode || "").toUpperCase();
  const stored = getStoredEnabledModulesV1(code);
  if (stored) {
    return {
      customerCode: code,
      enabledModules: stored.enabledModules,
      catalog: listModuleCatalogV1(),
      source: "stored",
      updatedAt: stored.updatedAt,
      updatedBy: stored.updatedBy,
    };
  }
  return {
    customerCode: code,
    enabledModules: resolveDefaultEnabledModulesV1(code),
    catalog: listModuleCatalogV1(),
    source: "default",
    updatedAt: null,
    updatedBy: null,
  };
}

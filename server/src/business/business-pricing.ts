import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type { PricingCategory, PricingRule, PricingScopeType } from "./business-types.js";

function rowToRule(r: Record<string, unknown>): PricingRule {
  return {
    id: String(r.id),
    scopeType: String(r.scope_type) as PricingScopeType,
    scopeRef: r.scope_ref != null ? String(r.scope_ref) : null,
    workCategory: String(r.work_category ?? "other"),
    name: String(r.name),
    unit: String(r.unit ?? "式"),
    unitPrice: Number(r.unit_price),
    costPrice: Number(r.cost_price ?? 0),
    taxType: String(r.tax_type ?? "standard"),
    memo: String(r.memo ?? ""),
    active: Boolean(r.active),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function listPricingRules(opts?: { activeOnly?: boolean }): PricingRule[] {
  const sql = opts?.activeOnly
    ? `SELECT * FROM business_pricing_rules WHERE active = 1 ORDER BY scope_type, name`
    : `SELECT * FROM business_pricing_rules ORDER BY scope_type, name`;
  return getDatabase()
    .prepare(sql)
    .all()
    .map((r) => rowToRule(r as Record<string, unknown>));
}

export function getPricingRule(id: string): PricingRule | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM business_pricing_rules WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToRule(row) : null;
}

export function createPricingRule(input: {
  scopeType: PricingScopeType;
  scopeRef?: string | null;
  workCategory?: PricingCategory | string;
  name: string;
  unit?: string;
  unitPrice: number;
  costPrice?: number;
  taxType?: string;
  memo?: string;
  active?: boolean;
}): PricingRule {
  const id = `BPR-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO business_pricing_rules (
        id, scope_type, scope_ref, work_category, name, unit, unit_price, cost_price,
        tax_type, memo, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.scopeType,
      input.scopeRef ?? null,
      input.workCategory ?? "other",
      input.name,
      input.unit ?? "式",
      input.unitPrice,
      input.costPrice ?? 0,
      input.taxType ?? "standard",
      input.memo ?? "",
      input.active !== false ? 1 : 0,
      now,
      now
    );
  return getPricingRule(id)!;
}

export function updatePricingRule(
  id: string,
  patch: Partial<{
    scopeType: PricingScopeType;
    scopeRef: string | null;
    workCategory: string;
    name: string;
    unit: string;
    unitPrice: number;
    costPrice: number;
    taxType: string;
    memo: string;
    active: boolean;
  }>
): PricingRule {
  const current = getPricingRule(id);
  if (!current) throw new Error("pricing rule not found");
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE business_pricing_rules SET
        scope_type = COALESCE(?, scope_type),
        scope_ref = COALESCE(?, scope_ref),
        work_category = COALESCE(?, work_category),
        name = COALESCE(?, name),
        unit = COALESCE(?, unit),
        unit_price = COALESCE(?, unit_price),
        cost_price = COALESCE(?, cost_price),
        tax_type = COALESCE(?, tax_type),
        memo = COALESCE(?, memo),
        active = COALESCE(?, active),
        updated_at = ?
      WHERE id = ?`
    )
    .run(
      patch.scopeType ?? null,
      patch.scopeRef !== undefined ? patch.scopeRef : null,
      patch.workCategory ?? null,
      patch.name ?? null,
      patch.unit ?? null,
      patch.unitPrice ?? null,
      patch.costPrice ?? null,
      patch.taxType ?? null,
      patch.memo ?? null,
      patch.active !== undefined ? (patch.active ? 1 : 0) : null,
      now,
      id
    );
  return getPricingRule(id)!;
}

export function deletePricingRule(id: string): void {
  const r = getDatabase()
    .prepare(`DELETE FROM business_pricing_rules WHERE id = ?`)
    .run(id);
  if (r.changes === 0) throw new Error("pricing rule not found");
}

export function seedPricingRulesFromTiers(): void {
  const has = getDatabase()
    .prepare(`SELECT id FROM business_pricing_rules LIMIT 1`)
    .get();
  if (has) return;
  const tiers = getDatabase()
    .prepare(`SELECT * FROM business_pricing_tiers`)
    .all() as Record<string, unknown>[];
  for (const tier of tiers) {
    const items = JSON.parse(String(tier.items_json || "[]")) as Array<{
      category?: string;
      name: string;
      unit?: string;
      defaultUnitPrice: number;
      costPrice?: number;
      taxType?: string;
      memo?: string;
    }>;
    const customerId = tier.customer_id != null ? String(tier.customer_id) : null;
    for (const item of items) {
      createPricingRule({
        scopeType: customerId ? "customer" : "standard",
        scopeRef: customerId,
        workCategory: item.category ?? "other",
        name: item.name,
        unit: item.unit,
        unitPrice: item.defaultUnitPrice,
        costPrice: item.costPrice,
        taxType: item.taxType,
        memo: item.memo,
        active: true,
      });
    }
  }
}

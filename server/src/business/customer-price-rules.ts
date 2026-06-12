import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type { CustomerPriceRuleSummary, EstimateLineItem } from "./business-types.js";
import { lineAmount } from "./estimate-math.js";

export interface CustomerPriceRule {
  id: string;
  customerId: string;
  ruleName: string;
  costMultiplier: number;
  laborMultiplier: number;
  discountPolicyMemo: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_PRICE_RULE: Pick<
  CustomerPriceRule,
  "ruleName" | "costMultiplier" | "laborMultiplier" | "discountPolicyMemo"
> = {
  ruleName: "標準",
  costMultiplier: 2.0,
  laborMultiplier: 2.0,
  discountPolicyMemo: "",
};

export const MANUAL_PRICE_RULE_NAME = "手動調整";

export interface PresetPriceRuleOption {
  id: string;
  ruleName: string;
  costMultiplier: number | null;
  laborMultiplier: number | null;
  label: string;
}

/** 見積PWAで選択できる単価ルールプリセット */
export const PRESET_PRICE_RULE_OPTIONS: PresetPriceRuleOption[] = [
  { id: "customer-a", ruleName: "客A", costMultiplier: 2.0, laborMultiplier: 2.0, label: "客A：原価 × 2.0" },
  { id: "customer-b", ruleName: "客B", costMultiplier: 3.0, laborMultiplier: 3.0, label: "客B：原価 × 3.0" },
  {
    id: "mgmt-a",
    ruleName: "管理会社A",
    costMultiplier: 1.8,
    laborMultiplier: 1.8,
    label: "管理会社A：原価 × 1.8",
  },
  {
    id: "individual",
    ruleName: "一般個人",
    costMultiplier: 2.5,
    laborMultiplier: 2.5,
    label: "一般個人：原価 × 2.5",
  },
  {
    id: "corp-standard",
    ruleName: "法人標準",
    costMultiplier: 2.2,
    laborMultiplier: 2.2,
    label: "法人標準：原価 × 2.2",
  },
  {
    id: "manual",
    ruleName: MANUAL_PRICE_RULE_NAME,
    costMultiplier: null,
    laborMultiplier: null,
    label: "手動調整",
  },
];

export function listPresetPriceRuleOptions(): PresetPriceRuleOption[] {
  return PRESET_PRICE_RULE_OPTIONS;
}

export function findPresetPriceRule(ruleName: string): PresetPriceRuleOption | undefined {
  return PRESET_PRICE_RULE_OPTIONS.find((p) => p.ruleName === ruleName);
}

export function resolveEstimatePriceRule(
  estimate: {
    priceRuleName?: string;
    priceRuleCostMultiplier?: number | null;
    priceRuleLaborMultiplier?: number | null;
  },
  customerId: string
): CustomerPriceRuleSummary {
  const storedName = (estimate.priceRuleName ?? "").trim();
  if (storedName === MANUAL_PRICE_RULE_NAME) {
    return {
      ruleName: MANUAL_PRICE_RULE_NAME,
      costMultiplier: 0,
      laborMultiplier: 0,
      discountPolicyMemo: "",
    };
  }
  if (storedName && estimate.priceRuleCostMultiplier != null) {
    return {
      ruleName: storedName,
      costMultiplier: estimate.priceRuleCostMultiplier,
      laborMultiplier: estimate.priceRuleLaborMultiplier ?? estimate.priceRuleCostMultiplier,
      discountPolicyMemo: "",
    };
  }
  const customer = getCustomerPriceRuleOrDefault(customerId);
  return {
    ruleName: customer.ruleName,
    costMultiplier: customer.costMultiplier,
    laborMultiplier: customer.laborMultiplier,
    discountPolicyMemo: customer.discountPolicyMemo,
  };
}

export function expectedUnitPriceFromRule(
  item: { category?: string; name?: string; costPrice?: number; unitPrice?: number },
  rule: Pick<CustomerPriceRule, "costMultiplier" | "laborMultiplier"> | CustomerPriceRuleSummary
): number | null {
  if (!isPriceRuleTargetLineItem(item)) return null;
  const baseCost = item.costPrice ?? 0;
  const mult = isLaborLineItem(item) ? rule.laborMultiplier : rule.costMultiplier;
  return Math.round(baseCost * mult);
}

export function findManualPriceLineIndices(
  items: EstimateLineItem[],
  rule: Pick<CustomerPriceRule, "costMultiplier" | "laborMultiplier"> | CustomerPriceRuleSummary
): number[] {
  const indices: number[] = [];
  items.forEach((item, i) => {
    const expected = expectedUnitPriceFromRule(item, rule);
    if (expected == null) return;
    const current = item.unitPrice ?? 0;
    if (current === expected) return;
    // 単価0・未入力は倍率適用対象。正の手入力のみ確認対象。
    if (current <= 0) return;
    indices.push(i);
  });
  return indices;
}

function rowToRule(r: Record<string, unknown>): CustomerPriceRule {
  return {
    id: String(r.id),
    customerId: String(r.customer_id),
    ruleName: String(r.rule_name),
    costMultiplier: Number(r.cost_multiplier),
    laborMultiplier: Number(r.labor_multiplier),
    discountPolicyMemo: String(r.discount_policy_memo ?? ""),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function isLaborLineItem(item: { category?: string; name?: string }): boolean {
  if (item.category === "labor") return true;
  const name = item.name ?? "";
  return /労務|工事|設置|配線/.test(name);
}

/** 倍率再計算の対象行（材料・労務）。その他は手入力を優先 */
export function isPriceRuleTargetLineItem(item: {
  category?: string;
  name?: string;
  costPrice?: number;
}): boolean {
  const baseCost = item.costPrice ?? 0;
  if (baseCost <= 0) return false;
  if (isLaborLineItem(item)) return true;
  if (item.category === "other") return false;
  return true;
}

export const CUSTOMER_PDF_PRICE_RULE_NOTE = "顧客別単価ルール適用";

const INTERNAL_CUSTOMER_NOTE_PATTERNS = [
  /現調PWA\s*v1/i,
  /SVY-[a-f0-9-]+/i,
  /部材\d+件/,
  /写真\d+枚/,
  /作成:\s*\S+/,
  /作成者/i,
  /顧客別単価ルール/,
  /\bowner\b/i,
  /\bJSON\b/i,
  /内部ID/i,
  /\bPWA\b/i,
  /BIZ-[A-Z0-9-]+/i,
];

export function filterInternalNotesFromCustomerPdf(notes: string | null | undefined): string {
  const raw = (notes ?? "").trim();
  if (!raw) return "";
  return raw
    .split(/\n|\s*\/\s*/)
    .map((line) => line.trim())
    .filter((line) => line && !INTERNAL_CUSTOMER_NOTE_PATTERNS.some((p) => p.test(line)))
    .join("\n");
}

export function buildCustomerFacingPdfNotes(
  userNotes: string | null | undefined,
  _ruleName?: string | null
): string {
  return filterInternalNotesFromCustomerPdf(userNotes);
}

export function applyCustomerPriceToItems(
  items: EstimateLineItem[],
  rule: Pick<CustomerPriceRule, "costMultiplier" | "laborMultiplier"> | null
): EstimateLineItem[] {
  const costMult = rule?.costMultiplier ?? DEFAULT_PRICE_RULE.costMultiplier;
  const laborMult = rule?.laborMultiplier ?? DEFAULT_PRICE_RULE.laborMultiplier;
  return items.map((item) => {
    if (!isPriceRuleTargetLineItem(item)) {
      return { ...item, amount: lineAmount(item.quantity, item.unitPrice) };
    }
    const isLabor = isLaborLineItem(item);
    const mult = isLabor ? laborMult : costMult;
    const baseCost = item.costPrice ?? 0;
    const unitPrice = Math.round(baseCost * mult);
    return {
      ...item,
      unitPrice,
      amount: lineAmount(item.quantity, unitPrice),
    };
  });
}

export function getCustomerPriceRule(customerId: string): CustomerPriceRule | null {
  const row = getDatabase()
    .prepare(
      `SELECT * FROM customer_price_rules WHERE customer_id = ? ORDER BY updated_at DESC LIMIT 1`
    )
    .get(customerId) as Record<string, unknown> | undefined;
  return row ? rowToRule(row) : null;
}

export function getCustomerPriceRuleOrDefault(customerId: string): CustomerPriceRule {
  const found = getCustomerPriceRule(customerId);
  if (found) return found;
  const now = new Date().toISOString();
  return {
    id: "default",
    customerId,
    ...DEFAULT_PRICE_RULE,
    createdAt: now,
    updatedAt: now,
  };
}

export function listCustomerPriceRules(): CustomerPriceRule[] {
  return getDatabase()
    .prepare(`SELECT * FROM customer_price_rules ORDER BY rule_name`)
    .all()
    .map((r) => rowToRule(r as Record<string, unknown>));
}

export function upsertCustomerPriceRule(input: {
  customerId: string;
  ruleName: string;
  costMultiplier: number;
  laborMultiplier: number;
  discountPolicyMemo?: string;
}): CustomerPriceRule {
  const existing = getCustomerPriceRule(input.customerId);
  const now = new Date().toISOString();
  if (existing) {
    getDatabase()
      .prepare(
        `UPDATE customer_price_rules SET
          rule_name = ?, cost_multiplier = ?, labor_multiplier = ?,
          discount_policy_memo = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.ruleName,
        input.costMultiplier,
        input.laborMultiplier,
        input.discountPolicyMemo ?? "",
        now,
        existing.id
      );
    return getCustomerPriceRule(input.customerId)!;
  }
  const id = `CPR-${uuid().slice(0, 8).toUpperCase()}`;
  getDatabase()
    .prepare(
      `INSERT INTO customer_price_rules (
        id, customer_id, rule_name, cost_multiplier, labor_multiplier,
        discount_policy_memo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.customerId,
      input.ruleName,
      input.costMultiplier,
      input.laborMultiplier,
      input.discountPolicyMemo ?? "",
      now,
      now
    );
  return getCustomerPriceRule(input.customerId)!;
}

/** 現調連携用: 固定 ID で business_customers を確保 */
export function ensureBusinessCustomer(input: {
  id: string;
  name: string;
  type?: "individual" | "company" | "management_company";
}): void {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT OR IGNORE INTO business_customers (
        id, name, type, contact_name, phone, email, address, pricing_tier_id,
        payment_terms, invoice_closing_day, created_at, updated_at
      ) VALUES (?, ?, ?, '', '', '', '', NULL, '', NULL, ?, ?)`
    )
    .run(input.id, input.name, input.type ?? "company", now, now);
}

export function seedCustomerPriceRules(): void {
  const marker = getDatabase()
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("seed:customer_price_rules_v1") as { value_json: string } | undefined;
  if (marker) return;

  const now = new Date().toISOString();
  const seeds: Array<{
    customerId: string;
    customerName: string;
    type: "individual" | "company" | "management_company";
    ruleName: string;
    costMultiplier: number;
    laborMultiplier: number;
    discountPolicyMemo: string;
  }> = [
    {
      customerId: "BCU-PRICE-A",
      customerName: "客A（サンプル）",
      type: "company",
      ruleName: "客A",
      costMultiplier: 2.0,
      laborMultiplier: 2.0,
      discountPolicyMemo: "端数は出精値引きで調整",
    },
    {
      customerId: "BCU-PRICE-B",
      customerName: "客B（サンプル）",
      type: "company",
      ruleName: "客B",
      costMultiplier: 3.0,
      laborMultiplier: 3.0,
      discountPolicyMemo: "端数は出精値引きで調整",
    },
    {
      customerId: "BCU-PRICE-MGMT",
      customerName: "管理会社A（サンプル）",
      type: "management_company",
      ruleName: "管理会社A",
      costMultiplier: 1.8,
      laborMultiplier: 1.8,
      discountPolicyMemo: "管理会社向け標準値引き方針",
    },
    {
      customerId: "BCU-PRICE-INDIV",
      customerName: "一般個人（サンプル）",
      type: "individual",
      ruleName: "一般個人",
      costMultiplier: 2.5,
      laborMultiplier: 2.5,
      discountPolicyMemo: "",
    },
    {
      customerId: "BCU-PRICE-CORP",
      customerName: "フレックス株式会社",
      type: "company",
      ruleName: "法人標準",
      costMultiplier: 2.2,
      laborMultiplier: 2.2,
      discountPolicyMemo: "法人向け標準。最終調整は出精値引き",
    },
    {
      customerId: "BCU-SVY-TOMS001",
      customerName: "TOMS001 デモ顧客",
      type: "company",
      ruleName: "法人標準",
      costMultiplier: 2.2,
      laborMultiplier: 2.2,
      discountPolicyMemo: "法人向け標準。最終調整は出精値引き",
    },
  ];

  for (const s of seeds) {
    ensureBusinessCustomer({ id: s.customerId, name: s.customerName, type: s.type });
    upsertCustomerPriceRule({
      customerId: s.customerId,
      ruleName: s.ruleName,
      costMultiplier: s.costMultiplier,
      laborMultiplier: s.laborMultiplier,
      discountPolicyMemo: s.discountPolicyMemo,
    });
  }

  getDatabase()
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, ?)`
    )
    .run("seed:customer_price_rules_v1", JSON.stringify({ seededAt: now }), now);
}

import { createPricingRule, listPricingRules } from "./business-pricing.js";
import type { PricingScopeType } from "./business-types.js";

const CSV_HEADERS = [
  "customer_code",
  "contractor_code",
  "work_category",
  "item_name",
  "unit",
  "unit_price",
  "tax_type",
  "active",
] as const;

function csvEscape(v: string | number | boolean): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function exportPricingRulesCsv(opts?: {
  customerCode?: string;
  contractorCode?: string;
}): string {
  let rules = listPricingRules();
  if (opts?.customerCode) {
    rules = rules.filter(
      (r) => r.scopeType === "customer" && r.scopeRef === opts.customerCode
    );
  }
  if (opts?.contractorCode) {
    rules = rules.filter(
      (r) => r.scopeType === "contractor" && r.scopeRef === opts.contractorCode
    );
  }
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rules) {
    const customerCode = r.scopeType === "customer" ? r.scopeRef ?? "" : "";
    const contractorCode = r.scopeType === "contractor" ? r.scopeRef ?? "" : "";
    lines.push(
      [
        customerCode,
        contractorCode,
        r.workCategory,
        r.name,
        r.unit,
        r.unitPrice,
        r.taxType,
        r.active ? "true" : "false",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n");
}

export function importPricingRulesCsv(csvText: string): {
  imported: number;
  skipped: number;
  errors: string[];
} {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lines.length) return { imported: 0, skipped: 0, errors: ["empty csv"] };
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const itemName = cells[col("item_name")]?.trim();
    const unitPrice = Number(cells[col("unit_price")] ?? NaN);
    if (!itemName || Number.isNaN(unitPrice)) {
      skipped++;
      errors.push(`line ${i + 1}: missing item_name or unit_price`);
      continue;
    }
    const customerCode = cells[col("customer_code")]?.trim();
    const contractorCode = cells[col("contractor_code")]?.trim();
    let scopeType: PricingScopeType = "standard";
    let scopeRef: string | null = null;
    if (customerCode) {
      scopeType = "customer";
      scopeRef = customerCode;
    } else if (contractorCode) {
      scopeType = "contractor";
      scopeRef = contractorCode;
    }
    const activeRaw = (cells[col("active")] ?? "true").trim().toLowerCase();
    try {
      createPricingRule({
        scopeType,
        scopeRef,
        workCategory: cells[col("work_category")]?.trim() || "other",
        name: itemName,
        unit: cells[col("unit")]?.trim() || "式",
        unitPrice,
        taxType: cells[col("tax_type")]?.trim() || "standard",
        active: !["false", "0", "no"].includes(activeRaw),
      });
      imported++;
    } catch (e) {
      skipped++;
      errors.push(`line ${i + 1}: ${(e as Error).message}`);
    }
  }
  return { imported, skipped, errors };
}

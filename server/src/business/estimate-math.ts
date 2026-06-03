import type { EstimateLineItem, PricingItem } from "./business-types.js";
import { v4 as uuid } from "uuid";

const TAX_RATE = 0.1;

export function lineAmount(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice);
}

export function calcTotals(items: EstimateLineItem[]): {
  subtotal: number;
  tax: number;
  total: number;
  internalCost: number;
  grossProfit: number;
  grossProfitRate: number;
} {
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const tax = Math.round(subtotal * TAX_RATE);
  const total = subtotal + tax;
  const internalCost = items.reduce(
    (s, i) => s + Math.round((i.costPrice ?? 0) * i.quantity),
    0
  );
  const grossProfit = subtotal - internalCost;
  const grossProfitRate = subtotal > 0 ? Math.round((grossProfit / subtotal) * 1000) / 10 : 0;
  return { subtotal, tax, total, internalCost, grossProfit, grossProfitRate };
}

export function normalizeLineItems(
  raw: Array<Partial<EstimateLineItem>>
): EstimateLineItem[] {
  return raw.map((r) => {
    const qty = Number(r.quantity ?? 1);
    const unitPrice = Number(r.unitPrice ?? 0);
    return {
      id: r.id ?? uuid(),
      category: r.category ?? "other",
      name: r.name ?? "項目",
      unit: r.unit ?? "式",
      quantity: qty,
      unitPrice,
      amount: r.amount ?? lineAmount(qty, unitPrice),
      costPrice: r.costPrice != null ? Number(r.costPrice) : undefined,
      memo: r.memo,
      fromAiCandidate: r.fromAiCandidate,
    };
  });
}

export function applyPricingTierToItems(
  items: Array<{ category?: string; name: string; unit?: string; quantity: number }>,
  pricingItems: PricingItem[]
): EstimateLineItem[] {
  return items.map((row) => {
    const match =
      pricingItems.find(
        (p) => p.name === row.name || (row.category && p.category === row.category)
      ) ?? pricingItems.find((p) => p.category === (row.category ?? "other"));
    const unitPrice = match?.defaultUnitPrice ?? 0;
    const costPrice = match?.costPrice ?? 0;
    const qty = row.quantity;
    return {
      id: uuid(),
      category: (row.category as EstimateLineItem["category"]) ?? match?.category ?? "other",
      name: row.name,
      unit: row.unit ?? match?.unit ?? "式",
      quantity: qty,
      unitPrice,
      amount: lineAmount(qty, unitPrice),
      costPrice,
      memo: match?.memo,
    };
  });
}

export function aiRecommendedToDraftLines(
  recommended: Record<string, unknown>,
  pricingItems: PricingItem[]
): EstimateLineItem[] {
  const rows: Array<{ category: string; name: string; unit: string; quantity: number }> = [];
  const cameras = recommended.cameras as Array<{ type?: string; qty?: number }> | undefined;
  if (cameras?.length) {
    for (const c of cameras) {
      rows.push({
        category: "camera",
        name: `防犯カメラ ${c.type ?? ""}`.trim(),
        unit: "台",
        quantity: c.qty ?? 1,
      });
    }
  }
  const sensors = recommended.sensors as Array<{ type?: string; qty?: number }> | undefined;
  if (sensors?.length) {
    for (const s of sensors) {
      rows.push({
        category: "other",
        name: `センサー ${s.type ?? ""}`.trim(),
        unit: "個",
        quantity: s.qty ?? 1,
      });
    }
  }
  const lights = recommended.lights as Array<{ type?: string; qty?: number }> | undefined;
  if (lights?.length) {
    for (const l of lights) {
      rows.push({
        category: "lighting",
        name: `照明制御 ${l.type ?? ""}`.trim(),
        unit: "台",
        quantity: l.qty ?? 1,
      });
    }
  }
  const sell = Number(recommended.estimatedSellJpy ?? 0);
  if (rows.length === 0 && sell > 0) {
    rows.push({ category: "other", name: "工事一式（AI候補）", unit: "式", quantity: 1 });
  }
  const lines = applyPricingTierToItems(rows, pricingItems);
  if (sell > 0 && lines.length === 1 && lines[0].amount === 0) {
    lines[0].unitPrice = sell;
    lines[0].amount = sell;
    lines[0].fromAiCandidate = true;
  } else {
    for (const line of lines) line.fromAiCandidate = true;
  }
  return lines;
}

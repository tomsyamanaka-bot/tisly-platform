import type { EstimateLineItem, PricingItem } from "./business-types.js";
export declare function lineAmount(quantity: number, unitPrice: number): number;
export declare function calcTotals(items: EstimateLineItem[]): {
    subtotal: number;
    tax: number;
    total: number;
    internalCost: number;
    grossProfit: number;
    grossProfitRate: number;
};
export declare function normalizeLineItems(raw: Array<Partial<EstimateLineItem>>): EstimateLineItem[];
export declare function applyPricingTierToItems(items: Array<{
    category?: string;
    name: string;
    unit?: string;
    quantity: number;
}>, pricingItems: PricingItem[]): EstimateLineItem[];
export declare function aiRecommendedToDraftLines(recommended: Record<string, unknown>, pricingItems: PricingItem[]): EstimateLineItem[];

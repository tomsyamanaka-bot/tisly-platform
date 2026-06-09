import type { PricingCategory, PricingRule, PricingScopeType } from "./business-types.js";
export declare function listPricingRules(opts?: {
    activeOnly?: boolean;
}): PricingRule[];
export declare function getPricingRule(id: string): PricingRule | null;
export declare function createPricingRule(input: {
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
}): PricingRule;
export declare function updatePricingRule(id: string, patch: Partial<{
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
}>): PricingRule;
export declare function deletePricingRule(id: string): void;
export declare function seedPricingRulesFromTiers(): void;

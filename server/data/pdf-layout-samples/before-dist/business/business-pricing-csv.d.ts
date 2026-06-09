export declare function exportPricingRulesCsv(opts?: {
    customerCode?: string;
    contractorCode?: string;
}): string;
export declare function previewPricingRulesCsv(csvText: string): {
    rows: Array<Record<string, string>>;
    errors: string[];
    validCount: number;
    invalidCount: number;
};
export declare function importPricingRulesCsv(csvText: string, opts?: {
    mode?: "append" | "replace";
}): {
    imported: number;
    skipped: number;
    errors: string[];
};

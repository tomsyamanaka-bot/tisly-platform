export interface UnifiedSearchHit {
    kind: "customer" | "project" | "estimate" | "invoice" | "asset" | "maintenance";
    id: string;
    title: string;
    subtitle: string;
    href: string;
    score: number;
}
export declare function unifiedSearch(query: string, limit?: number): UnifiedSearchHit[];

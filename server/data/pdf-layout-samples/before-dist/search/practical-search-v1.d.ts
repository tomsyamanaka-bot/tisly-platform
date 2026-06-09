/** 検索 PWA v1 — 見積番号・請求番号・顧客・電話・住所・担当・案件名・工事場所 */
export interface PracticalSearchHitV1 {
    kind: "estimate" | "invoice" | "customer" | "project" | "survey" | "phone" | "address";
    id: string;
    title: string;
    subtitle: string;
    href: string;
}
export declare function practicalSearchV1(query: string, limit?: number): PracticalSearchHitV1[];

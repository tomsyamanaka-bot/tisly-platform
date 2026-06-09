export declare const DEMO_PACK_CODES: readonly ["TOMS001", "TOMS002", "TISLY-DEMO", "MINPAKU-DEMO", "FACTORY-DEMO"];
export type DemoPackCode = (typeof DEMO_PACK_CODES)[number];
export interface DemoPackCustomerDef {
    customerId: string;
    customerCode: DemoPackCode;
    customerName: string;
    plan: "Lite" | "Standard" | "PRO" | "PRO_REMOTE";
    companyColor: string;
    siteId: string;
    siteName: string;
    address: string;
}
export declare const DEMO_PACK_CUSTOMERS: DemoPackCustomerDef[];
export declare function seedDemoCustomerAccounts(): void;
/** Idempotent — 5デモ顧客＋現場・機器・現調・通知履歴 */
export declare function ensureDemoCustomerPack(): {
    customers: number;
    seeded: string[];
};
export declare function getDemoPackStatus(): Array<{
    code: string;
    name: string;
    siteCount: number;
    deviceCount: number;
    photoCount: number;
    notificationCount: number;
}>;
export declare function clearDemoPackSurveyUploads(): void;

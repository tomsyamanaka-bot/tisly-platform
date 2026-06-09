export type PwaAppId = "installer" | "survey" | "schedule_v1" | "survey_v1" | "estimate_v1" | "business" | "pro_remote" | "maintenance" | "customer_portal" | "admin";
export interface PwaAppCard {
    id: PwaAppId;
    label: string;
    description: string;
    href: (customerCode: string) => string;
    themeColor: string;
    optional?: boolean;
}
export declare const PWA_APP_CATALOG: Record<PwaAppId, PwaAppCard>;
/** Role → visible PWA apps (Google TV excluded — not a PWA). */
export declare function getPwaAppsForRole(role: string, opts?: {
    installerSurveyOptional?: boolean;
}): PwaAppId[];
export declare function canAccessPwa(role: string, pwaId: PwaAppId): boolean;
export declare function buildHubCards(role: string, customerCode: string, opts?: {
    installerSurveyOptional?: boolean;
}): Array<PwaAppCard & {
    url: string;
}>;
/** 実務 PWA 入口カード（App Hub 上部に表示） */
export type PracticalPwaStatus = "ready" | "coming_soon";
export interface PracticalPwaCard {
    id: string;
    label: string;
    subtitle: string;
    icon: string;
    features: string[];
    url: string | null;
    themeColor: string;
    status: PracticalPwaStatus;
    statusLabel: string;
}
export declare function buildPracticalHubCards(role: string): PracticalPwaCard[];
/** manager 以上のみデプロイ系カードを表示 */
export declare function showOpsPanelsForRole(role: string): boolean;

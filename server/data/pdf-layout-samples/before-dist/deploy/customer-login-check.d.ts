/**
 * Phase 2161–2200 — 顧客ログイン本番確認 API
 */
export interface CustomerLoginCheckItem {
    id: string;
    label: string;
    ok: boolean;
    detail?: string;
}
export interface CustomerLoginCheckReport {
    phase: "2161-2200";
    ready: boolean;
    customerRouteOk: boolean;
    authEndpointOk: boolean;
    customerPortalHtmlOk: boolean;
    customerJsOk: boolean;
    loginFormExists: boolean;
    submitButtonExists: boolean;
    portalNavHiddenBeforeLogin: boolean;
    submitHandlerOk: boolean;
    authApiOk: boolean;
    demoAccountOk: boolean;
    postLoginRedirectOk: boolean;
    demoUsers: string[];
    demoPasswordConfigured: boolean;
    shellVersion: string;
    shellTag: string;
    customerPortalPrecached: boolean;
    checks: CustomerLoginCheckItem[];
    curlVerifyBlock: string[];
}
export declare function buildVpsCustomerLoginDeployBlock(): string[];
export declare function buildCustomerLoginCheck(): CustomerLoginCheckReport;

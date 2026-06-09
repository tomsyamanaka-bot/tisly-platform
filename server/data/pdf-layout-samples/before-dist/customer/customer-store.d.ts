import type { CustomerBrandingRow, CustomerPlan, CustomerRow, CustomerSiteRow, CustomerStatus, DeviceTypePro } from "./types.js";
export declare function getCustomerByCode(code: string): CustomerRow | undefined;
export declare function getCustomerById(id: string): CustomerRow | undefined;
export declare function listCustomers(activeOnly?: boolean): CustomerRow[];
export declare function getBranding(customerId: string): CustomerBrandingRow | null;
export declare function listSitesForCustomer(customerId: string): CustomerSiteRow[];
export interface CustomerDeviceView {
    deviceId: string;
    id: string;
    deviceType: string;
    label: string | null;
    siteId: string | null;
    serialNumber: string | null;
    firmwareVersion: string | null;
    lastSeen: string | null;
    firstSeen?: string | null;
    heartbeatStatus: string;
    deviceStatus?: string;
    online: boolean;
}
export declare function listDevicesForCustomer(customerId: string): CustomerDeviceView[];
export declare function upsertCustomer(input: {
    customerId: string;
    customerCode: string;
    customerName: string;
    plan: CustomerPlan;
    status?: CustomerStatus;
    tenantId?: string;
    branding?: {
        logoUrl?: string;
        companyColor?: string;
        companyName?: string;
    };
}): CustomerRow;
export declare function ensureDemoSite(customerId: string, siteId: string, siteName: string, address?: string): void;
export declare function ensureDemoDevice(input: {
    id: string;
    customerId: string;
    siteId: string;
    deviceId: string;
    deviceType: DeviceTypePro;
    label: string;
    serialNumber?: string;
    firmwareVersion?: string;
    online?: boolean;
}): void;
export declare function getDashboardSummary(customerId: string): {
    overallStatus: "normal" | "warning" | "abnormal";
    deviceCount: number;
    onlineCount: number;
    offlineCount: number;
    notificationCount: number;
    lastEvent: {
        at: string;
        type: string;
        message: string;
    } | null;
};
export declare function customerUrls(code: string): {
    customer: string;
    tv: string;
    admin: string;
};

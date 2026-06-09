export interface CustomerPackageData {
    customerCode: string;
    customerName: string;
    loginUrl: string;
    loginUsername: string;
    initialPasswordNote: string;
    devices: Array<{
        deviceId: string;
        label: string;
        kind: string;
    }>;
    qrList: Array<{
        assetId: string;
        deviceId: string;
        label: string;
        detailUrl: string;
    }>;
    maintenanceContact: {
        phone: string;
        email: string;
        hours: string;
    };
    generatedAt: string;
}
export declare function buildCustomerPackageData(customerCode: string): CustomerPackageData | null;
export declare function buildCustomerPackageHtml(customerCode: string): string;
export declare function buildCustomerPackagePdfBuffer(customerCode: string): Buffer;

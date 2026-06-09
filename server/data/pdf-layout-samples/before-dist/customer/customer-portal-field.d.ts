import { listAssetQrHistory } from "../assets/asset-qr.js";
import { listMaintenanceReports } from "../maintenance/maintenance-schedule.js";
import { listMaintenanceCases } from "../maintenance/maintenance-store.js";
export interface CustomerPortalFieldView {
    customerCode: string;
    ownerOnly: true;
    devices: Array<{
        deviceId: string;
        label: string;
        deviceType: string;
        status: string;
    }>;
    cameras: Array<{
        deviceId: string;
        label: string;
        status: string;
    }>;
    qrAssets: ReturnType<typeof listAssetQrHistory>;
    completionReports: Array<{
        projectId: string;
        title: string;
        pdfPath: string | null;
        createdAt: string;
    }>;
    maintenanceHistory: ReturnType<typeof listMaintenanceReports>;
    maintenanceCases: ReturnType<typeof listMaintenanceCases>;
    notificationHistory: Array<{
        id: string;
        message: string;
        severity: string;
        createdAt: string;
    }>;
}
export declare function buildCustomerPortalFieldView(customerCode: string): CustomerPortalFieldView | null;

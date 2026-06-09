import { getDeploymentChecklistRC2 } from "../deployment-kit/deployment-checklist-rc2.js";
export interface CustomerHandoverPackage {
    customerCode: string;
    customerName: string;
    generatedAt: string;
    equipment: Array<{
        deviceId: string;
        label: string;
        kind: string;
        status: string;
    }>;
    qrList: Array<{
        assetId: string;
        deviceId: string;
        label: string;
        url: string;
    }>;
    constructionPhotos: Array<{
        url: string;
        caption: string;
    }>;
    completionReport: {
        title: string;
        workMemo: string;
        pdfUrl: string | null;
    } | null;
    maintenanceSchedule: Array<{
        title: string;
        dueDate: string;
        status: string;
    }>;
    emergencyContact: {
        phone: string;
        email: string;
        hours: string;
    };
    loginUrl: string;
    tvUrl: string;
    proRemoteUrl: string;
    handoverUrl: string;
    deploymentChecklist: ReturnType<typeof getDeploymentChecklistRC2>;
}
export declare function buildCustomerHandoverPackage(customerCode: string): CustomerHandoverPackage | null;

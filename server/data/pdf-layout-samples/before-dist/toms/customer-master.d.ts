import { listMapDevicesForCustomer } from "../site-builder/map-store.js";
import type { BusinessProject } from "../business/business-types.js";
import { type TomsKpiByCustomer } from "./toms-kpi.js";
export interface CustomerMasterRecord {
    id: string;
    businessCustomerId: string | null;
    name: string;
    company: string;
    address: string;
    phone: string;
    email: string;
    sites: Array<{
        name: string;
        address: string;
    }>;
    createdAt: string;
    updatedAt: string;
}
export interface CustomerMasterDetail extends CustomerMasterRecord {
    projects: BusinessProject[];
    constructionHistory: BusinessProject[];
    invoiceHistory: Array<{
        projectId: string;
        invoiceNo: string;
        total: number;
    }>;
    paymentHistory: Array<{
        projectId: string;
        amount: number;
        date: string;
    }>;
    maintenanceHistory: unknown[];
    devices: ReturnType<typeof listMapDevicesForCustomer>;
    notificationHistory: Array<{
        id: string;
        title: string;
        kind: string;
        projectId: string;
    }>;
    kpi: TomsKpiByCustomer;
}
export declare function syncCustomerMasterFromBusiness(): number;
export declare function listCustomerMaster(): CustomerMasterRecord[];
export declare function getCustomerMaster(id: string): CustomerMasterDetail | null;
export declare function upsertCustomerMaster(input: {
    name: string;
    company?: string;
    address?: string;
    phone?: string;
    email?: string;
    sites?: Array<{
        name: string;
        address: string;
    }>;
}): CustomerMasterRecord;

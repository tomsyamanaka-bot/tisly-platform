export interface TomsKpiMonth {
    month: string;
    revenue: number;
    grossProfit: number;
    projectCount: number;
}
export interface TomsKpiByCustomer {
    customerId: string;
    customerName: string;
    revenue: number;
    grossProfit: number;
    uninvoiced: number;
    unpaid: number;
    maintenanceCount: number;
    anomalyCount: number;
}
export interface TomsKpiBySite {
    siteName: string;
    address: string;
    projectCount: number;
    revenue: number;
    anomalyCount: number;
}
export interface TomsKpiDashboard {
    revenue: number;
    grossProfit: number;
    projectCount: number;
    uninvoiced: number;
    unpaid: number;
    maintenanceContracts: number;
    maintenanceCases: number;
    anomalyCount: number;
    avgConstructionDays: number;
    estimateApprovalRate: number;
    monthly: TomsKpiMonth[];
    byCustomer: TomsKpiByCustomer[];
    bySite: TomsKpiBySite[];
}
export declare function buildTomsKpi(): TomsKpiDashboard;
export declare function buildCustomerKpi(customerId: string, customerName: string): TomsKpiByCustomer;

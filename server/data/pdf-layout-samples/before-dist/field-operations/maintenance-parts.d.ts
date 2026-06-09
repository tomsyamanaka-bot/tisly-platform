export interface MaintenanceReplacementPart {
    partId: string;
    reportId: string;
    customerCode: string;
    partName: string;
    quantity: number;
    unit: string;
    notes: string | null;
    createdAt: string;
}
export declare function addMaintenanceReplacementParts(input: {
    reportId: string;
    customerCode: string;
    parts: Array<{
        partName: string;
        quantity?: number;
        unit?: string;
        notes?: string;
    }>;
}): MaintenanceReplacementPart[];
export declare function listMaintenanceReplacementParts(reportId: string): MaintenanceReplacementPart[];

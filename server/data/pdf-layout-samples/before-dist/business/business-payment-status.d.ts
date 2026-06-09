import type { BusinessProjectStatus } from "./business-types.js";
export declare function computePaymentStatus(projectId: string): BusinessProjectStatus | null;
export declare function applyPaymentStatusAfterRecord(projectId: string): {
    previousStatus: string;
    newStatus: string | null;
    changed: boolean;
};

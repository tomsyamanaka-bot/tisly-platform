export type ChecklistItemId = "power" | "lan" | "esp" | "shelly" | "notification" | "tv" | "pwa" | "qr" | "maintenance";
export interface DeploymentChecklistItem {
    id: ChecklistItemId;
    label: string;
    ok: boolean;
    detail: string;
}
export declare function getChecklistState(customerCode: string): Record<ChecklistItemId, boolean>;
export declare function updateChecklistItem(customerCode: string, itemId: ChecklistItemId, ok: boolean): {
    items: Record<ChecklistItemId, boolean>;
    deploymentComplete: boolean;
};
export declare function buildDeploymentChecklist(customerCode?: string): Promise<{
    phase: string;
    ready: boolean;
    deploymentComplete: boolean;
    customerCode: string | null;
    items: DeploymentChecklistItem[];
}>;
export declare function markDeploymentComplete(customerCode: string): Promise<boolean>;
